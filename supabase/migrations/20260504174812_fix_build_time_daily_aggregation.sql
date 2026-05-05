-- Fix: build_logs was never aggregated into daily_build_time, causing build
-- time usage to always report 0 in billing/quota checks.
--
-- This migration:
-- 1. Adds app_id to build_logs (required for daily_build_time PK (app_id, date))
-- 2. Backfills app_id from build_requests using build_id = builder_job_id
-- 3. Replaces record_build_time() to accept and store app_id
-- 4. Adds a trigger on build_logs that upserts into daily_build_time
-- 5. Backfills daily_build_time from existing build_logs data

-- ============================================================================
-- Step 1: Add app_id column to build_logs
-- ============================================================================
ALTER TABLE "public"."build_logs"
  ADD COLUMN "app_id" character varying;

-- FK to apps: use SET NULL to preserve raw build-time history for billing
-- reconciliation even after app deletion (org_id still identifies the owner).
ALTER TABLE "public"."build_logs"
  ADD CONSTRAINT "build_logs_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE SET NULL;

-- Index for aggregation queries
CREATE INDEX IF NOT EXISTS "idx_build_logs_app_id_created_at"
  ON "public"."build_logs" ("app_id", "created_at");

-- ============================================================================
-- Step 2: Backfill app_id from build_requests
-- ============================================================================
UPDATE "public"."build_logs" bl
SET "app_id" = br."app_id"
FROM "public"."build_requests" br
WHERE bl."build_id" = br."builder_job_id"
  AND bl."org_id" = br."owner_org"
  AND bl."app_id" IS NULL;

-- Warn if any build_logs rows remain without app_id (orphaned legacy data).
-- These rows won't appear in daily_build_time but are preserved for audit via org_id.
-- We use WARNING instead of EXCEPTION because orphaned historical rows should not
-- block deployment; all future inserts always have app_id set via record_build_time().
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.build_logs WHERE app_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'build_logs backfill: % rows remain without app_id (orphaned legacy data)', v_count;
  END IF;
END;
$$;

-- ============================================================================
-- Step 3: Replace record_build_time() to accept p_app_id
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."record_build_time"(
  "p_org_id" "uuid",
  "p_user_id" "uuid",
  "p_build_id" character varying,
  "p_platform" character varying,
  "p_build_time_unit" bigint,
  "p_app_id" character varying
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
  v_caller_user_id uuid;
  v_invoking_role text;
BEGIN
  -- Reject NULL/empty app_id: daily_build_time is keyed by app_id
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  -- Verify the app belongs to the org to prevent wrong attribution
  IF NOT EXISTS (
    SELECT 1 FROM public.apps
    WHERE app_id = p_app_id AND owner_org = p_org_id
  ) THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  SELECT NULLIF(current_setting('role', true), '') INTO v_invoking_role;

  -- Service-role callers do not have JWT/API key context and pass p_user_id directly.
  -- Keep this path for internal calls from backend services.
  IF v_invoking_role = 'service_role' THEN
    v_caller_user_id := p_user_id;
  ELSE
    -- Use get_identity_org_appid (not get_identity_org_allowed) per project guidelines,
    -- since we have app_id available for scoped authorization.
    v_caller_user_id := public.get_identity_org_appid(
      '{read,upload,write,all}'::public.key_mode[],
      p_org_id,
      p_app_id
    );
  END IF;

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT public.check_min_rights(
    'write'::public.user_min_right,
    v_caller_user_id,
    p_org_id,
    p_app_id,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF p_build_time_unit < 0 THEN
    RAISE EXCEPTION 'Build time cannot be negative';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;

  -- Apply platform multiplier
  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_unit * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_unit, billable_seconds, app_id)
  VALUES (p_org_id, v_caller_user_id, p_build_id, p_platform, p_build_time_unit, v_billable_seconds, p_app_id)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_unit = EXCLUDED.build_time_unit,
    billable_seconds = EXCLUDED.billable_seconds,
    app_id = EXCLUDED.app_id
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;

ALTER FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) TO "service_role";

-- Drop the old 5-param overload to avoid ambiguity
DROP FUNCTION IF EXISTS "public"."record_build_time"("uuid", "uuid", character varying, character varying, bigint);

-- ============================================================================
-- Step 4: Trigger function to aggregate build_logs into daily_build_time
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."aggregate_build_log_to_daily"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_old_date date;
BEGIN
  -- Handle DELETE: subtract old values and return
  IF TG_OP = 'DELETE' THEN
    IF OLD.app_id IS NOT NULL THEN
      v_old_date := (OLD.created_at AT TIME ZONE 'UTC')::date;
      UPDATE public.daily_build_time
      SET build_time_unit = GREATEST(build_time_unit - OLD.billable_seconds, 0),
          build_count = GREATEST(build_count - 1, 0)
      WHERE app_id = OLD.app_id AND date = v_old_date;
    END IF;
    RETURN OLD;
  END IF;

  -- Handle UPDATE: subtract old values from the old bucket (if old had app_id)
  IF TG_OP = 'UPDATE' AND OLD.app_id IS NOT NULL THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'UTC')::date;
    UPDATE public.daily_build_time
    SET build_time_unit = GREATEST(build_time_unit - OLD.billable_seconds, 0),
        build_count = GREATEST(build_count - 1, 0)
    WHERE app_id = OLD.app_id AND date = v_old_date;
  END IF;

  -- Handle INSERT/UPDATE: add new values (only if new app_id is set)
  IF NEW.app_id IS NOT NULL THEN
    INSERT INTO public.daily_build_time (app_id, date, build_time_unit, build_count)
    VALUES (NEW.app_id, (NEW.created_at AT TIME ZONE 'UTC')::date, NEW.billable_seconds, 1)
    ON CONFLICT (app_id, date) DO UPDATE SET
      build_time_unit = public.daily_build_time.build_time_unit + EXCLUDED.build_time_unit,
      build_count = public.daily_build_time.build_count + EXCLUDED.build_count;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."aggregate_build_log_to_daily"() OWNER TO "postgres";

-- Attach the trigger
CREATE TRIGGER "aggregate_build_log_to_daily_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."build_logs"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."aggregate_build_log_to_daily"();

-- ============================================================================
-- Step 5: Backfill daily_build_time from existing build_logs
-- ============================================================================
-- Clear any stale/test data in daily_build_time and rebuild from build_logs.
-- Delete all existing rows first so the subsequent INSERT truly rebuilds from source.
DELETE FROM public.daily_build_time;

-- Disable the trigger during backfill to avoid double-counting
ALTER TABLE "public"."build_logs" DISABLE TRIGGER "aggregate_build_log_to_daily_trigger";

INSERT INTO public.daily_build_time (app_id, date, build_time_unit, build_count)
SELECT
  bl.app_id,
  (bl.created_at AT TIME ZONE 'UTC')::date AS date,
  SUM(bl.billable_seconds),
  COUNT(*)
FROM public.build_logs bl
WHERE bl.app_id IS NOT NULL
GROUP BY bl.app_id, (bl.created_at AT TIME ZONE 'UTC')::date
ON CONFLICT (app_id, date) DO UPDATE SET
  build_time_unit = EXCLUDED.build_time_unit,
  build_count = EXCLUDED.build_count;

-- Re-enable the trigger after backfill
ALTER TABLE "public"."build_logs" ENABLE TRIGGER "aggregate_build_log_to_daily_trigger";
