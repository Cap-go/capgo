


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";








ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_tle";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgmq";






CREATE EXTENSION IF NOT EXISTS "plpgsql_check" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE TYPE "public"."action_type" AS ENUM (
    'mau',
    'storage',
    'bandwidth',
    'build_time'
);


ALTER TYPE "public"."action_type" OWNER TO "postgres";


CREATE TYPE "public"."credit_metric_type" AS ENUM (
    'mau',
    'bandwidth',
    'storage',
    'build_time'
);


ALTER TYPE "public"."credit_metric_type" OWNER TO "postgres";


CREATE TYPE "public"."credit_transaction_type" AS ENUM (
    'grant',
    'purchase',
    'manual_grant',
    'deduction',
    'expiry',
    'refund'
);


ALTER TYPE "public"."credit_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."cron_task_type" AS ENUM (
    'function',
    'queue',
    'function_queue'
);


ALTER TYPE "public"."cron_task_type" OWNER TO "postgres";


CREATE TYPE "public"."disable_update" AS ENUM (
    'major',
    'minor',
    'patch',
    'version_number',
    'none'
);


ALTER TYPE "public"."disable_update" OWNER TO "postgres";


CREATE TYPE "public"."key_mode" AS ENUM (
    'read',
    'write',
    'all',
    'upload'
);


ALTER TYPE "public"."key_mode" OWNER TO "postgres";


CREATE TYPE "public"."manifest_entry" AS (
	"file_name" character varying,
	"s3_path" character varying,
	"file_hash" character varying
);


ALTER TYPE "public"."manifest_entry" OWNER TO "postgres";


CREATE TYPE "public"."message_update" AS (
	"msg_id" bigint,
	"cf_id" character varying,
	"queue" character varying
);


ALTER TYPE "public"."message_update" OWNER TO "postgres";


CREATE TYPE "public"."orgs_table" AS (
	"id" "uuid",
	"created_by" "uuid",
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"logo" "text",
	"name" "text"
);


ALTER TYPE "public"."orgs_table" OWNER TO "postgres";


CREATE TYPE "public"."owned_orgs" AS (
	"id" "uuid",
	"created_by" "uuid",
	"logo" "text",
	"name" "text",
	"role" character varying
);


ALTER TYPE "public"."owned_orgs" OWNER TO "postgres";


CREATE TYPE "public"."platform_os" AS ENUM (
    'ios',
    'android',
    'electron'
);


ALTER TYPE "public"."platform_os" OWNER TO "postgres";


CREATE TYPE "public"."stats_action" AS ENUM (
    'delete',
    'reset',
    'set',
    'get',
    'set_fail',
    'update_fail',
    'download_fail',
    'windows_path_fail',
    'canonical_path_fail',
    'directory_path_fail',
    'unzip_fail',
    'low_mem_fail',
    'download_10',
    'download_20',
    'download_30',
    'download_40',
    'download_50',
    'download_60',
    'download_70',
    'download_80',
    'download_90',
    'download_complete',
    'decrypt_fail',
    'app_moved_to_foreground',
    'app_moved_to_background',
    'uninstall',
    'needPlanUpgrade',
    'missingBundle',
    'noNew',
    'disablePlatformIos',
    'disablePlatformAndroid',
    'disableAutoUpdateToMajor',
    'cannotUpdateViaPrivateChannel',
    'disableAutoUpdateToMinor',
    'disableAutoUpdateToPatch',
    'channelMisconfigured',
    'disableAutoUpdateMetadata',
    'disableAutoUpdateUnderNative',
    'disableDevBuild',
    'disableEmulator',
    'cannotGetBundle',
    'checksum_fail',
    'NoChannelOrOverride',
    'setChannel',
    'getChannel',
    'rateLimited',
    'disableAutoUpdate',
    'keyMismatch',
    'ping',
    'InvalidIp',
    'blocked_by_server_url',
    'download_manifest_start',
    'download_manifest_complete',
    'download_zip_start',
    'download_zip_complete',
    'download_manifest_file_fail',
    'download_manifest_checksum_fail',
    'download_manifest_brotli_fail',
    'backend_refusal',
    'download_0',
    'disableProdBuild',
    'disableDevice',
    'disablePlatformElectron'
);


ALTER TYPE "public"."stats_action" OWNER TO "postgres";


CREATE TYPE "public"."stats_table" AS (
	"mau" bigint,
	"bandwidth" bigint,
	"storage" bigint
);


ALTER TYPE "public"."stats_table" OWNER TO "postgres";


CREATE TYPE "public"."stripe_status" AS ENUM (
    'created',
    'succeeded',
    'updated',
    'failed',
    'deleted',
    'canceled'
);


ALTER TYPE "public"."stripe_status" OWNER TO "postgres";


CREATE TYPE "public"."user_min_right" AS ENUM (
    'invite_read',
    'invite_upload',
    'invite_write',
    'invite_admin',
    'invite_super_admin',
    'read',
    'upload',
    'write',
    'admin',
    'super_admin'
);


ALTER TYPE "public"."user_min_right" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'read',
    'upload',
    'write',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."version_action" AS ENUM (
    'get',
    'fail',
    'install',
    'uninstall'
);


ALTER TYPE "public"."version_action" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  invite record;
  use_rbac boolean;
  legacy_right public.user_min_right;
  role_id uuid;
BEGIN
  SELECT org_users.* FROM public.org_users
  INTO invite
  WHERE org_users.org_id = accept_invitation_to_org.org_id
    AND (SELECT auth.uid()) = org_users.user_id;

  IF invite IS NULL THEN
    RETURN 'NO_INVITE';
  END IF;

  IF NOT (invite.user_right::varchar ILIKE 'invite_' || '%') THEN
    RETURN 'INVALID_ROLE';
  END IF;

  use_rbac := public.rbac_is_enabled_for_org(invite.org_id);

  IF use_rbac AND invite.rbac_role_name IS NOT NULL THEN
    legacy_right := public.rbac_legacy_right_for_org_role(invite.rbac_role_name);

    UPDATE public.org_users
    SET user_right = legacy_right,
        updated_at = CURRENT_TIMESTAMP
    WHERE org_users.id = invite.id;

    SELECT id INTO role_id FROM public.roles
    WHERE name = invite.rbac_role_name
      AND scope_type = public.rbac_scope_org()
    LIMIT 1;

    IF role_id IS NULL THEN
      RETURN 'ROLE_NOT_FOUND';
    END IF;

    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = invite.user_id
      AND scope_type = public.rbac_scope_org()
      AND role_bindings.org_id = invite.org_id;

    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      app_id,
      channel_id,
      granted_by,
      granted_at,
      reason,
      is_direct
    ) VALUES (
      public.rbac_principal_user(),
      invite.user_id,
      role_id,
      public.rbac_scope_org(),
      invite.org_id,
      NULL,
      NULL,
      auth.uid(),
      now(),
      'Accepted invitation',
      true
    ) ON CONFLICT DO NOTHING;

    RETURN 'OK';
  END IF;

  UPDATE public.org_users
  SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::public.user_min_right
  WHERE org_users.id = invite.id;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("overage_amount" numeric, "credits_required" numeric, "credits_applied" numeric, "credits_remaining" numeric, "credit_step_id" bigint, "overage_covered" numeric, "overage_unpaid" numeric, "overage_event_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_calc RECORD;
  v_event_id uuid;
  v_remaining numeric := 0;
  v_applied numeric := 0;
  v_per_unit numeric := 0;
  v_available numeric;
  v_use numeric;
  v_balance numeric;
  v_overage_paid numeric := 0;
  v_existing_credits_debited numeric := 0;
  v_required numeric := 0;
  v_credits_to_apply numeric := 0;
  v_credits_available numeric := 0;
  v_latest_event_id uuid;
  v_latest_overage_amount numeric;
  v_needs_new_record boolean := false;
  grant_rec public.usage_credit_grants%ROWTYPE;
BEGIN
  -- Early exit for invalid input
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  -- Calculate credit cost for this overage
  SELECT *
  INTO v_calc
  FROM public.calculate_credit_cost(p_metric, p_overage_amount)
  LIMIT 1;

  -- If no pricing step found, create a single record and exit
  IF v_calc.credit_step_id IS NULL THEN
    -- Check if we already have a record for this cycle with NULL step
    SELECT uoe.id, uoe.overage_amount INTO v_latest_event_id, v_latest_overage_amount
    FROM public.usage_overage_events uoe
    WHERE uoe.org_id = p_org_id
      AND uoe.metric = p_metric
      AND uoe.credit_step_id IS NULL
      AND (uoe.billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
      AND (uoe.billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date)
    ORDER BY uoe.created_at DESC
    LIMIT 1;

    -- Only create new record if overage amount changed significantly (more than 1% or first record)
    IF v_latest_event_id IS NULL OR ABS(v_latest_overage_amount - p_overage_amount) / NULLIF(v_latest_overage_amount, 0) > 0.01 THEN
      INSERT INTO public.usage_overage_events (
        org_id,
        metric,
        overage_amount,
        credits_estimated,
        credits_debited,
        credit_step_id,
        billing_cycle_start,
        billing_cycle_end,
        details
      )
      VALUES (
        p_org_id,
        p_metric,
        p_overage_amount,
        0,
        0,
        NULL,
        p_billing_cycle_start,
        p_billing_cycle_end,
        p_details
      )
      RETURNING id INTO v_event_id;
    ELSE
      -- Reuse existing event
      v_event_id := v_latest_event_id;
    END IF;

    RETURN QUERY SELECT p_overage_amount, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, p_overage_amount, v_event_id;
    RETURN;
  END IF;

  v_per_unit := v_calc.credit_cost_per_unit;
  v_required := v_calc.credits_required;

  -- Get the most recent event for this cycle
  SELECT uoe.id, uoe.overage_amount
  INTO v_latest_event_id, v_latest_overage_amount
  FROM public.usage_overage_events uoe
  WHERE uoe.org_id = p_org_id
    AND uoe.metric = p_metric
    AND (uoe.billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
    AND (uoe.billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date)
  ORDER BY uoe.created_at DESC
  LIMIT 1;

  -- Calculate how many credits we can still try to apply
  -- Use credits_debited for this since it reflects actual consumption
  SELECT COALESCE(SUM(credits_debited), 0)
  INTO v_existing_credits_debited
  FROM public.usage_overage_events
  WHERE org_id = p_org_id
    AND metric = p_metric
    AND (billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
    AND (billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date);

  v_credits_to_apply := GREATEST(v_required - v_existing_credits_debited, 0);
  v_remaining := v_credits_to_apply;

  -- Check if there are any credits available in grants
  SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
  INTO v_credits_available
  FROM public.usage_credit_grants
  WHERE org_id = p_org_id
    AND expires_at >= now();

  -- Determine if we need a new record:
  -- 1. No existing record for this cycle (first overage)
  -- 2. Overage amount changed significantly (more than 1%)
  -- 3. We have NEW credits available AND we need to apply them
  v_needs_new_record := v_latest_event_id IS NULL
    OR (v_latest_overage_amount IS NOT NULL
        AND ABS(v_latest_overage_amount - p_overage_amount) / NULLIF(v_latest_overage_amount, 0) > 0.01)
    OR (v_credits_to_apply > 0 AND v_credits_available > 0 AND v_existing_credits_debited = 0);

  -- Only create new record if needed
  IF v_needs_new_record THEN
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      credit_step_id,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES (
      p_org_id,
      p_metric,
      p_overage_amount,
      v_required,
      0,
      v_calc.credit_step_id,
      p_billing_cycle_start,
      p_billing_cycle_end,
      p_details
    )
    RETURNING id INTO v_event_id;

    -- Apply credits from available grants if any
    IF v_credits_to_apply > 0 THEN
      FOR grant_rec IN
        SELECT *
        FROM public.usage_credit_grants
        WHERE org_id = p_org_id
          AND expires_at >= now()
          AND credits_consumed < credits_total
        ORDER BY expires_at ASC, granted_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;

        v_available := grant_rec.credits_total - grant_rec.credits_consumed;
        IF v_available <= 0 THEN
          CONTINUE;
        END IF;

        v_use := LEAST(v_available, v_remaining);
        v_remaining := v_remaining - v_use;
        v_applied := v_applied + v_use;

        UPDATE public.usage_credit_grants
        SET credits_consumed = credits_consumed + v_use
        WHERE id = grant_rec.id;

        INSERT INTO public.usage_credit_consumptions (
          grant_id,
          org_id,
          overage_event_id,
          metric,
          credits_used
        )
        VALUES (
          grant_rec.id,
          p_org_id,
          v_event_id,
          p_metric,
          v_use
        );

        SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
        INTO v_balance
        FROM public.usage_credit_grants
        WHERE org_id = p_org_id
          AND expires_at >= now();

        INSERT INTO public.usage_credit_transactions (
          org_id,
          grant_id,
          transaction_type,
          amount,
          balance_after,
          occurred_at,
          description,
          source_ref
        )
        VALUES (
          p_org_id,
          grant_rec.id,
          'deduction',
          -v_use,
          v_balance,
          now(),
          format('Overage deduction for %s usage', p_metric::text),
          jsonb_build_object('overage_event_id', v_event_id, 'metric', p_metric::text)
        );
      END LOOP;

      -- Update the event with actual credits applied
      UPDATE public.usage_overage_events
      SET credits_debited = v_applied
      WHERE id = v_event_id;
    END IF;
  ELSE
    -- Reuse latest event ID, no new record needed
    v_event_id := v_latest_event_id;
  END IF;

  -- Calculate how much overage is covered by credits
  IF v_per_unit > 0 THEN
    v_overage_paid := LEAST(p_overage_amount, (v_applied + v_existing_credits_debited) / v_per_unit);
  ELSE
    v_overage_paid := p_overage_amount;
  END IF;

  RETURN QUERY SELECT
    p_overage_amount,
    v_required,
    v_applied,
    GREATEST(v_required - v_existing_credits_debited - v_applied, 0),
    v_calc.credit_step_id,
    v_overage_paid,
    GREATEST(p_overage_amount - v_overage_paid, 0),
    v_event_id;
END;
$$;


ALTER FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_old_record JSONB;
  v_new_record JSONB;
  v_changed_fields TEXT[];
  v_org_id UUID;
  v_record_id TEXT;
  v_user_id UUID;
  v_key TEXT;
  v_org_exists BOOLEAN;
BEGIN
  -- Skip audit logging for org DELETE operations
  -- When an org is deleted, we can't insert into audit_logs because the org_id
  -- foreign key would reference a non-existent org
  IF TG_TABLE_NAME = 'orgs' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Get current user from auth context or API key
  -- Uses get_identity() WITH key_mode parameter to support both JWT auth and API key authentication
  -- This is the fix: previously called get_identity() without parameters which only checked auth.uid()
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

  -- Skip audit logging if no user is identified
  -- We only want to log actions performed by authenticated users
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Convert records to JSONB based on operation type
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    -- Calculate changed fields by comparing old and new values
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;
  END IF;

  -- Get org_id and record_id based on table being modified
  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'apps' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.app_id, OLD.app_id)::TEXT;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    ELSE
      -- Fallback for any other table (shouldn't happen with current triggers)
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  -- Only insert if we have a valid org_id and the org still exists
  -- This handles edge cases where related tables are deleted after the org
  IF v_org_id IS NOT NULL THEN
    -- Check if the org still exists (important for DELETE operations on child tables)
    SELECT EXISTS(SELECT 1 FROM public.orgs WHERE id = v_org_id) INTO v_org_exists;

    IF v_org_exists THEN
      INSERT INTO "public"."audit_logs" (
        table_name, record_id, operation, user_id, org_id,
        old_record, new_record, changed_fields
      ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
        v_old_record, v_new_record, v_changed_fields
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."audit_log_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_apikey_name_by_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN

  IF (NEW.name IS NOT DISTINCT FROM NULL) OR LENGTH(NEW.name) = 0 THEN
    NEW.name = format('Apikey %s', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_apikey_name_by_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW."app_id" IS DISTINCT FROM OLD."app_id" AND OLD."app_id" IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = public.get_user_main_org_id_by_app_id(NEW."app_id");

   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_owner_org_by_app_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) RETURNS TABLE("credit_step_id" bigint, "credit_cost_per_unit" numeric, "credits_required" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_step public.capgo_credits_steps%ROWTYPE;
  v_highest public.capgo_credits_steps%ROWTYPE;
  v_remaining numeric;
  v_applied_range numeric;
  v_units numeric;
  v_total_credits numeric := 0;
  v_last_step_id bigint := NULL;
  v_unit_factor numeric;
BEGIN
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  v_remaining := p_overage_amount;

  SELECT *
  INTO v_highest
  FROM public.capgo_credits_steps
  WHERE type = p_metric::text
  ORDER BY step_max DESC, step_min DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING 'No pricing steps found for metric: %', p_metric::text;
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  FOR v_step IN
    SELECT *
    FROM public.capgo_credits_steps
    WHERE type = p_metric::text
    ORDER BY step_min ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF p_overage_amount < v_step.step_min THEN
      EXIT;
    END IF;

    v_applied_range := LEAST(
      v_remaining,
      (v_step.step_max - v_step.step_min)::numeric
    );

    IF v_applied_range <= 0 THEN
      CONTINUE;
    END IF;

    v_unit_factor := GREATEST(NULLIF(v_step.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_applied_range / v_unit_factor);

    IF v_units <= 0 THEN
      CONTINUE;
    END IF;

    v_total_credits := v_total_credits + (v_units * v_step.price_per_unit::numeric);
    v_remaining := v_remaining - v_applied_range;
    v_last_step_id := v_step.id;
  END LOOP;

  IF v_remaining > 0 THEN
    v_unit_factor := GREATEST(NULLIF(v_highest.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_remaining / v_unit_factor);

    IF v_units > 0 THEN
      v_total_credits := v_total_credits + (v_units * v_highest.price_per_unit::numeric);
      v_last_step_id := v_highest.id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_last_step_id::bigint,
    CASE WHEN p_overage_amount > 0 THEN v_total_credits / p_overage_amount ELSE 0 END,
    v_total_credits;
END;
$$;


ALTER FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_encrypted_bundle_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  org_enforcing boolean;
  org_required_key varchar(21);
  bundle_is_encrypted boolean;
  bundle_key_id varchar(20);
BEGIN
  -- Derive org_id from app_id directly to avoid trigger ordering issues.
  -- The force_valid_owner_org_app_versions trigger runs after this one
  -- (alphabetically), so NEW.owner_org may not be populated yet.
  -- We look up the org from the apps table using the app_id.
  IF NEW.owner_org IS NOT NULL THEN
    org_id := NEW.owner_org;
  ELSE
    SELECT apps.owner_org INTO org_id
    FROM public.apps
    WHERE apps.app_id = NEW.app_id;
  END IF;

  -- If org not found, allow (will fail on other checks)
  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the org's enforcement settings
  SELECT enforce_encrypted_bundles, required_encryption_key
  INTO org_enforcing, org_required_key
  FROM public.orgs
  WHERE id = org_id;

  -- If org doesn't exist or doesn't enforce encrypted bundles, allow
  IF org_enforcing IS NULL OR org_enforcing = false THEN
    RETURN NEW;
  END IF;

  -- Check if this bundle is encrypted (has a non-empty session_key)
  bundle_is_encrypted := NEW.session_key IS NOT NULL AND NEW.session_key <> '';
  bundle_key_id := NEW.key_id;

  IF NOT bundle_is_encrypted THEN
    -- Log the rejection for audit
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES_TRIGGER',
      jsonb_build_object(
        'org_id', org_id,
        'app_id', NEW.app_id,
        'version_name', NEW.name,
        'user_id', NEW.user_id,
        'reason', 'not_encrypted'
      ));
    RAISE EXCEPTION 'encryption_required: This organization requires all bundles to be encrypted. Please upload an encrypted bundle with a session_key.';
  END IF;

  -- If org requires a specific key, check the key_id matches
  IF org_required_key IS NOT NULL AND org_required_key <> '' THEN
    -- Bundle must have a key_id that starts with the required key fingerprint
    IF bundle_key_id IS NULL OR bundle_key_id = '' THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'missing_key_id'
        ));
      RAISE EXCEPTION 'encryption_key_required: This organization requires bundles to be encrypted with a specific key. The uploaded bundle does not have a key_id.';
    END IF;

    -- Check if the bundle's key_id starts with the required key fingerprint
    -- We use starts_with because key_id is 20 chars and required_encryption_key is up to 21 chars
    IF NOT (bundle_key_id = LEFT(org_required_key, 20) OR LEFT(bundle_key_id, LENGTH(org_required_key)) = org_required_key) THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'key_mismatch'
        ));
      RAISE EXCEPTION 'encryption_key_mismatch: This organization requires bundles to be encrypted with a specific key. The uploaded bundle was encrypted with a different key.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_encrypted_bundle_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM public.orgs
  WHERE
  (
      (
      SELECT
          count(*)
      FROM
          public.org_users
      WHERE
          org_users.user_right = 'super_admin'
          AND org_users.user_id != OLD.user_id
          AND org_users.org_id=orgs.id
      ) = 0
  ) 
  AND orgs.id=OLD.org_id;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."check_if_org_can_exist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := public.check_min_rights(min_right, (SELECT auth.uid()), org_id, app_id, channel_id);
  RETURN allowed;
END;
$$;


ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_perm text;
  v_scope text;
  v_apikey text;
  v_apikey_principal uuid;
  v_use_rbac boolean;
  v_effective_org_id uuid := org_id;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
  api_key record;
BEGIN
  -- Derive org from app/channel when not provided to honor org-level flag and scoping.
  IF v_effective_org_id IS NULL AND app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.apps WHERE public.apps.app_id = check_min_rights.app_id LIMIT 1;
  END IF;
  IF v_effective_org_id IS NULL AND channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.channels WHERE public.channels.id = channel_id LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id;
    IF v_org_enforcing_2fa = true AND (user_id IS NULL OR NOT public.has_2fa_enabled(user_id)) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
        'org_id', COALESCE(org_id, v_effective_org_id),
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'org_id', COALESCE(org_id, v_effective_org_id),
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);
  IF NOT v_use_rbac THEN
    RETURN public.check_min_rights_legacy(min_right, user_id, COALESCE(org_id, v_effective_org_id), app_id, channel_id);
  END IF;

  IF channel_id IS NOT NULL THEN
    v_scope := public.rbac_scope_channel();
  ELSIF app_id IS NOT NULL THEN
    v_scope := public.rbac_scope_app();
  ELSE
    v_scope := public.rbac_scope_org();
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);

  IF user_id IS NOT NULL THEN
    v_allowed := public.rbac_has_permission(public.rbac_principal_user(), user_id, v_perm, v_effective_org_id, app_id, channel_id);
  END IF;

  -- Also consider apikey principal when RBAC is enabled (API keys can hold roles directly).
  IF NOT v_allowed THEN
    SELECT public.get_apikey_header() INTO v_apikey;
    IF v_apikey IS NOT NULL THEN
      -- Enforce org/app scoping before using the apikey RBAC principal.
      SELECT * FROM public.find_apikey_by_value(v_apikey) INTO api_key;
      IF api_key.id IS NOT NULL THEN
        IF public.is_apikey_expired(api_key.expires_at) THEN
          PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', v_effective_org_id, 'app_id', app_id));
        ELSIF v_effective_org_id IS NULL THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_NO_ORG', jsonb_build_object('app_id', app_id));
        ELSIF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 AND NOT (v_effective_org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id));
        ELSIF app_id IS NOT NULL AND api_key.limited_to_apps IS DISTINCT FROM '{}' AND NOT (app_id = ANY(api_key.limited_to_apps)) THEN
          PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_APIKEY_APP_RESTRICT', jsonb_build_object('org_id', v_effective_org_id, 'app_id', app_id));
        ELSE
          v_apikey_principal := api_key.rbac_id;
          IF v_apikey_principal IS NOT NULL THEN
            v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, v_perm, v_effective_org_id, app_id, channel_id);
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_RBAC', jsonb_build_object('org_id', COALESCE(org_id, v_effective_org_id), 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id, 'scope', v_scope, 'perm', v_perm));
  END IF;

  RETURN v_allowed;
END;
$$;


ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_right_record RECORD;
  v_org_enforcing_2fa boolean;
  v_password_policy_ok boolean;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = org_id;
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object(
        'org_id', org_id,
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(user_id, org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'org_id', org_id,
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  FOR user_right_record IN
    SELECT org_users.user_right, org_users.app_id, org_users.channel_id
    FROM public.org_users
    WHERE org_users.org_id = check_min_rights_legacy.org_id AND org_users.user_id = check_min_rights_legacy.user_id
  LOOP
    IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id = check_min_rights_legacy.channel_id)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_right_record RECORD;
  v_org_enforcing_2fa boolean;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa FROM public.orgs WHERE id = org_id;
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
      PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_PW_2FA_ENFORCEMENT', jsonb_build_object(
        'org_id', org_id,
        'app_id', app_id,
        'channel_id', channel_id,
        'min_right', min_right::text,
        'user_id', user_id
      ));
      RETURN false;
    END IF;
  END IF;

  FOR user_right_record IN
    SELECT org_users.user_right, org_users.app_id, org_users.channel_id
    FROM public.org_users
    WHERE org_users.org_id = check_min_rights_legacy_no_password_policy.org_id
      AND org_users.user_id = check_min_rights_legacy_no_password_policy.user_id
  LOOP
    IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy_no_password_policy.app_id AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy_no_password_policy.app_id AND user_right_record.channel_id = check_min_rights_legacy_no_password_policy.channel_id)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_LEGACY_NO_PW', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_enforcing boolean;
  is_encrypted boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_encrypted_bundles INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_encrypted_bundle_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce encrypted bundles, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this bundle is encrypted
  is_encrypted := public.is_bundle_encrypted(session_key);

  IF NOT is_encrypted THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES',
      jsonb_build_object('org_id', org_id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."apikeys" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "key" character varying,
    "mode" "public"."key_mode" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" character varying NOT NULL,
    "limited_to_orgs" "uuid"[] DEFAULT '{}'::"uuid"[],
    "limited_to_apps" character varying[] DEFAULT '{}'::character varying[],
    "key_hash" "text",
    "expires_at" timestamp with time zone,
    "rbac_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."apikeys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apikeys"."key_hash" IS 'SHA-256 hash of the API key. When set, the key column is cleared to null for security.';



COMMENT ON COLUMN "public"."apikeys"."expires_at" IS 'When this API key expires. NULL means never expires.';



COMMENT ON COLUMN "public"."apikeys"."rbac_id" IS 'Stable UUID to bind RBAC roles to api keys.';



CREATE OR REPLACE FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_enforcing boolean;
  is_hashed_key boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_hashed_api_keys INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_hashed_key_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce hashed keys, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this is a hashed key (key is null, key_hash is not null)
  is_hashed_key := (apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL);

  IF NOT is_hashed_key THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('org_id', org_id, 'apikey_id', apikey_row.id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") RETURNS TABLE("user_id" "uuid", "2fa_enabled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_2fa_enabled.org_id) THEN
        RAISE EXCEPTION 'Organization does not exist';
    END IF;

    -- Check if the current user is a super_admin of the organization
    IF NOT (
        public.check_min_rights(
            'super_admin'::public.user_min_right,
            (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], check_org_members_2fa_enabled.org_id)),
            check_org_members_2fa_enabled.org_id,
            NULL::character varying,
            NULL::bigint
        )
    ) THEN
        RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    -- Return list of org members with their 2FA status
    RETURN QUERY
    SELECT 
        ou.user_id,
        COALESCE(public.has_2fa_enabled(ou.user_id), false) AS "2fa_enabled"
    FROM public.org_users ou
    WHERE ou.org_id = check_org_members_2fa_enabled.org_id;
END;
$$;


ALTER FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "password_policy_compliant" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_is_service_role boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_password_policy.org_id) THEN
        RAISE EXCEPTION 'Organization does not exist';
    END IF;

    -- Check if called by service_role or postgres (similar pattern to existing codebase)
    v_is_service_role := (
        ((SELECT auth.jwt() ->> 'role') = 'service_role')
        OR ((SELECT current_user) IS NOT DISTINCT FROM 'postgres')
    );

    -- Allow service_role/postgres to bypass the auth check (for testing and admin purposes)
    IF NOT v_is_service_role THEN
        -- Check if the current user is a super_admin of the organization
        IF NOT (
            public.check_min_rights(
                'super_admin'::public.user_min_right,
                (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], check_org_members_password_policy.org_id)),
                check_org_members_password_policy.org_id,
                NULL::character varying,
                NULL::bigint
            )
        ) THEN
            RAISE EXCEPTION 'NO_RIGHTS';
        END IF;
    END IF;

    -- Return list of org members with their password policy compliance status
    RETURN QUERY
    SELECT
        ou.user_id,
        au.email::text,
        u.first_name::text,
        u.last_name::text,
        public.user_meets_password_policy(ou.user_id, check_org_members_password_policy.org_id) AS "password_policy_compliant"
    FROM public.org_users ou
    JOIN auth.users au ON au.id = ou.user_id
    LEFT JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = check_org_members_password_policy.org_id;
END;
$$;


ALTER FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_user_privileges"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN

  -- here we check if the user is a service role in order to bypass this permission check
  IF (((SELECT auth.jwt() ->> 'role')='service_role') OR ((SELECT current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;

  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (SELECT auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::"public"."user_min_right"
  THEN
    PERFORM public.pg_log('deny: ELEVATE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::"public"."user_min_right"
  THEN
    PERFORM public.pg_log('deny: ELEVATE_INVITE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_org_user_privileges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    DECLARE
        version_id INTEGER;
    BEGIN
        SELECT id INTO version_id FROM public.app_versions WHERE name = 'builtin' AND app_id = appid;
        IF NOT FOUND THEN
            INSERT INTO public.app_versions(name, app_id, storage_provider)
            VALUES ('builtin', appid, 'r2')
            RETURNING id INTO version_id;
        END IF;
        RETURN version_id;
    END;
END;
$$;


ALTER FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_apikeys"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."apikeys"
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW() - INTERVAL '30 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_apikeys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_demo_apps"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    deleted_count bigint;
BEGIN
    DELETE FROM public.apps
    WHERE app_id LIKE 'com.capdemo.%'
      AND created_at < NOW() - INTERVAL '14 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'cleanup_expired_demo_apps: Deleted % expired demo apps', deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_demo_apps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE job_pid IN (
        SELECT jobid
        FROM cron.job
        WHERE schedule = '5 seconds' OR schedule = '1 seconds' OR schedule = '10 seconds'
    )
    AND end_time < NOW() - interval '1 hour';
END;
$$;


ALTER FUNCTION "public"."cleanup_frequent_job_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_job_run_details_7days"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_job_run_details_7days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."audit_logs"
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_channel_devices"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    deleted_count bigint;
    purged_count bigint;
BEGIN
    -- Disable triggers on channel_devices to avoid unnecessary queue operations during bulk cleanup
    -- This prevents the enqueue_channel_device_counts trigger from firing for each deleted row
    ALTER TABLE public.channel_devices DISABLE TRIGGER channel_device_count_enqueue;

    -- Use nested block with exception handler to ensure trigger is re-enabled on any failure
    BEGIN
        -- Delete channel_devices where the last activity (updated_at or created_at) is older than 1 month
        DELETE FROM public.channel_devices
        WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '1 month';

        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        -- Re-enable triggers before any further operations
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;

        IF deleted_count > 0 THEN
            RAISE NOTICE 'cleanup_old_channel_devices: Deleted % stale channel device entries', deleted_count;

            -- Purge any pending messages in the channel_device_counts queue before recomputing
            -- This prevents stale deltas from being applied after the full recount
            SELECT pgmq.purge_queue('channel_device_counts') INTO purged_count;
            IF purged_count > 0 THEN
                RAISE NOTICE 'cleanup_old_channel_devices: Purged % pending queue messages', purged_count;
            END IF;

            -- Recalculate channel_device_count for all apps since we bypassed the trigger
            -- This is more efficient than firing triggers for potentially thousands of rows
            UPDATE public.apps
            SET channel_device_count = COALESCE((
                SELECT COUNT(*)
                FROM public.channel_devices cd
                WHERE cd.app_id = apps.app_id
            ), 0);

            RAISE NOTICE 'cleanup_old_channel_devices: Recalculated channel_device_count for all apps';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ensure trigger is re-enabled even on failure
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;
        RAISE;
    END;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_channel_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
    queue_name text;
BEGIN
    -- Clean up messages older than 7 days from all queues
    FOR queue_name IN (
        SELECT q.queue_name FROM pgmq.list_queues() q
    ) LOOP
        -- Delete archived messages older than 7 days
        EXECUTE format('DELETE FROM pgmq.a_%I WHERE archived_at < $1', queue_name)
        USING (NOW() - INTERVAL '7 days')::timestamptz;
        
        -- Delete failed messages that have been retried more than 5 times
        EXECUTE format('DELETE FROM pgmq.q_%I WHERE read_ct > 5', queue_name);
    END LOOP;
END;
$_$;


ALTER FUNCTION "public"."cleanup_queue_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_webhook_deliveries"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."webhook_deliveries"
  WHERE "created_at" < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_webhook_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN bytes_value / 1024.0 / 1024.0 / 1024.0;
END;
$$;


ALTER FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN bytes_value / 1024.0 / 1024.0;
END;
$$;


ALTER FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN gb * 1024 * 1024 * 1024;
END;
$$;


ALTER FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN gb * 1024 * 1024;
END;
$$;


ALTER FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  percentage numeric;
BEGIN
  IF max_val = 0 THEN
    RETURN 0;
  ELSE
    percentage := ((val * 100) / max_val)::numeric;
    -- Add small epsilon for positive values to handle floating-point errors
    -- Subtract epsilon for negative values
    IF percentage >= 0 THEN
      RETURN trunc(percentage + 0.0001, 0);
    ELSE
      RETURN trunc(percentage - 0.0001, 0);
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_active_users"("app_ids" character varying[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM public.apps
        WHERE app_id = ANY(app_ids)
    );
END;
$$;


ALTER FUNCTION "public"."count_active_users"("app_ids" character varying[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_need_upgrade"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM public.stripe_info WHERE is_good_plan = false AND status = 'succeeded');
END;  
$$;


ALTER FUNCTION "public"."count_all_need_upgrade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_onboarded"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT COUNT(DISTINCT owner_org) FROM public.apps);
END;  
$$;


ALTER FUNCTION "public"."count_all_onboarded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"() RETURNS TABLE("plan_name" character varying, "count" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY 
  WITH ActiveSubscriptions AS (
    SELECT DISTINCT ON (si.customer_id)
      p.name AS product_name,
      si.customer_id
    FROM public.stripe_info si
    INNER JOIN public.plans p ON si.product_id = p.stripe_id 
    WHERE si.status = 'succeeded'
    ORDER BY si.customer_id, si.created_at DESC
  ),
  TrialUsers AS (
    SELECT DISTINCT ON (si.customer_id)
      'Trial' AS product_name,
      si.customer_id
    FROM public.stripe_info si
    WHERE si.trial_at > NOW() 
    AND si.status IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM ActiveSubscriptions a 
      WHERE a.customer_id = si.customer_id
    )
  )
  SELECT 
    product_name as plan_name,
    COUNT(*) as count
  FROM (
    SELECT product_name, customer_id FROM ActiveSubscriptions
    UNION ALL
    SELECT product_name, customer_id FROM TrialUsers
  ) all_subs
  GROUP BY product_name;
END;
$$;


ALTER FUNCTION "public"."count_all_plans_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text" DEFAULT NULL::"text") RETURNS TABLE("non_encrypted_count" bigint, "wrong_key_count" bigint, "total_non_compliant" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  non_encrypted bigint := 0;
  wrong_key bigint := 0;
  caller_user_id uuid;
  caller_right public.user_min_right;
BEGIN
  -- Get the current user's ID (supports both JWT and API key authentication)
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Check if the caller is a super_admin of this organization
  SELECT user_right INTO caller_right
  FROM public.org_users
  WHERE org_users.user_id = caller_user_id
    AND org_users.org_id = count_non_compliant_bundles.org_id;

  IF caller_right IS NULL OR caller_right <> 'super_admin'::public.user_min_right THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  -- Count bundles without encryption (no session_key)
  SELECT COUNT(*) INTO non_encrypted
  FROM public.app_versions av
  JOIN public.apps a ON a.app_id = av.app_id
  WHERE a.owner_org = count_non_compliant_bundles.org_id
    AND av.deleted = false
    AND (av.session_key IS NULL OR av.session_key = '');

  -- Count bundles with wrong key (if required_key is specified)
  IF required_key IS NOT NULL AND required_key <> '' THEN
    SELECT COUNT(*) INTO wrong_key
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = count_non_compliant_bundles.org_id
      AND av.deleted = false
      AND av.session_key IS NOT NULL
      AND av.session_key <> ''
      AND (
        av.key_id IS NULL
        OR av.key_id = ''
        OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
      );
  END IF;

  RETURN QUERY SELECT non_encrypted, wrong_key, (non_encrypted + wrong_key);
END;
$$;


ALTER FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion"() RETURNS TABLE("deleted_count" integer, "deleted_user_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  account_record RECORD;
  org_record RECORD;
  deleted_users UUID[] := ARRAY[]::UUID[];
  total_deleted INTEGER := 0;
  other_super_admins_count INTEGER;
  replacement_owner_id UUID;
BEGIN
  -- Loop through all accounts marked for deletion where removal_date has passed
  FOR account_record IN
    SELECT "account_id", "removal_date", "removed_data"
    FROM "public"."to_delete_accounts"
    WHERE "removal_date" < NOW()
  LOOP
    BEGIN
      -- Process each org the user belongs to
      FOR org_record IN
        SELECT DISTINCT "org_id", "user_right"
        FROM "public"."org_users"
        WHERE "user_id" = account_record.account_id
      LOOP
        -- Reset replacement_owner_id for each org
        replacement_owner_id := NULL;

        -- Check if user is a super_admin in this org
        IF org_record.user_right = 'super_admin'::"public"."user_min_right" THEN
          -- Count other super_admins in this org (excluding the user being deleted)
          SELECT COUNT(*) INTO other_super_admins_count
          FROM "public"."org_users"
          WHERE "org_id" = org_record.org_id
            AND "user_id" != account_record.account_id
            AND "user_right" = 'super_admin'::"public"."user_min_right";

          IF other_super_admins_count = 0 THEN
            -- User is the last super_admin: DELETE all org resources
            RAISE NOTICE 'User % is last super_admin of org %. Deleting all org resources.',
              account_record.account_id, org_record.org_id;

          -- Delete deploy_history for this org
          DELETE FROM "public"."deploy_history" WHERE "owner_org" = org_record.org_id;

          -- Delete channel_devices for this org
          DELETE FROM "public"."channel_devices" WHERE "owner_org" = org_record.org_id;

          -- Delete channels for this org
          DELETE FROM "public"."channels" WHERE "owner_org" = org_record.org_id;

          -- Delete app_versions for this org
          DELETE FROM "public"."app_versions" WHERE "owner_org" = org_record.org_id;

          -- Delete apps for this org
          DELETE FROM "public"."apps" WHERE "owner_org" = org_record.org_id;

          -- Delete the org itself since user is last super_admin
          -- Note: audit_logs will be cascade deleted with the org
          DELETE FROM "public"."orgs" WHERE "id" = org_record.org_id;

            -- Skip ownership transfer since all resources are deleted
            CONTINUE;
          END IF;
        END IF;

        -- If we reach here, we need to transfer ownership (either non-super_admin or non-last super_admin)
        -- Find a super_admin to transfer ownership to
        SELECT "user_id" INTO replacement_owner_id
        FROM "public"."org_users"
        WHERE "org_id" = org_record.org_id
          AND "user_id" != account_record.account_id
          AND "user_right" = 'super_admin'::"public"."user_min_right"
        LIMIT 1;

        IF replacement_owner_id IS NOT NULL THEN
          RAISE NOTICE 'Transferring ownership from user % to user % in org %',
            account_record.account_id, replacement_owner_id, org_record.org_id;

          -- Transfer app ownership
          UPDATE "public"."apps"
          SET "user_id" = replacement_owner_id, "updated_at" = NOW()
          WHERE "user_id" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer app_versions ownership
          UPDATE "public"."app_versions"
          SET "user_id" = replacement_owner_id, "updated_at" = NOW()
          WHERE "user_id" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer channels ownership
          UPDATE "public"."channels"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "created_by" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer deploy_history ownership
          UPDATE "public"."deploy_history"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "created_by" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer org ownership if user created it
          UPDATE "public"."orgs"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "id" = org_record.org_id AND "created_by" = account_record.account_id;

          -- Transfer audit_logs ownership
          UPDATE "public"."audit_logs"
          SET "user_id" = replacement_owner_id
          WHERE "user_id" = account_record.account_id AND "org_id" = org_record.org_id;
        ELSE
          RAISE WARNING 'No super_admin found to transfer ownership in org % for user %',
            org_record.org_id, account_record.account_id;
        END IF;
      END LOOP;

      -- Delete from public.users table
      DELETE FROM "public"."users" WHERE "id" = account_record.account_id;

      -- Delete from auth.users table
      DELETE FROM "auth"."users" WHERE "id" = account_record.account_id;

      -- Remove from to_delete_accounts table
      DELETE FROM "public"."to_delete_accounts" WHERE "account_id" = account_record.account_id;

      -- Track the deleted user
      deleted_users := "array_append"(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;

      -- Log the deletion
      RAISE NOTICE 'Successfully deleted account: % (removal date: %)',
        account_record.account_id, account_record.removal_date;

    EXCEPTION
      WHEN OTHERS THEN
        -- Log the error but continue with other accounts
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;

  -- Return results
  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;

  RAISE NOTICE 'Deletion process completed. Total accounts deleted: %', total_deleted;
END;
$$;


ALTER FUNCTION "public"."delete_accounts_marked_for_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_http_response"("request_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM net._http_response 
    WHERE id = request_id;
END;
$$;


ALTER FUNCTION "public"."delete_http_response"("request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
  caller_right public.user_min_right;
BEGIN
  -- Get the current user's ID (supports both JWT and API key authentication)
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Check if the caller is a super_admin of this organization
  SELECT user_right INTO caller_right
  FROM public.org_users
  WHERE org_users.user_id = caller_user_id
    AND org_users.org_id = delete_non_compliant_bundles.org_id;

  IF caller_right IS NULL OR caller_right <> 'super_admin'::public.user_min_right THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  -- First, collect all bundle IDs that will be deleted
  IF required_key IS NULL OR required_key = '' THEN
    -- Only delete non-encrypted bundles
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    -- Delete non-encrypted bundles AND bundles with wrong key
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        -- Non-encrypted bundles
        (av.session_key IS NULL OR av.session_key = '')
        OR
        -- Encrypted but with wrong key
        (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  -- If there are bundles to delete, mark them as deleted
  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    -- Log the action
    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_apps"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM "public"."deleted_apps"
    WHERE deleted_at < NOW() - INTERVAL '35 days';
END;
$$;


ALTER FUNCTION "public"."delete_old_deleted_apps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count bigint;
BEGIN
    -- Delete versions that are:
    -- 1. Have deleted_at set (soft deleted)
    -- 2. Soft-deleted more than 1 year ago
    -- 3. NOT builtin or unknown (these are special placeholder versions)
    -- 4. NOT currently linked to any channel (safety check)
    DELETE FROM "public"."app_versions"
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '3 months'
      AND name NOT IN ('builtin', 'unknown')
      AND NOT EXISTS (
        SELECT 1 FROM "public"."channels"
        WHERE channels.version = app_versions.id
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
    END IF;
END;
$$;


ALTER FUNCTION "public"."delete_old_deleted_versions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_existing_binding_id uuid;
  v_org_created_by uuid;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent removing the org owner
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Check if removing a super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
    AND r.scope_type = public.rbac_scope_org()
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Deletes an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';



CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
  old_record_json jsonb;
  last_sign_in_at_ts timestamptz;
BEGIN
  -- Get the current user ID and email
  SELECT "auth"."uid"() INTO user_id_fn;
  IF user_id_fn IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT "email", "last_sign_in_at" INTO user_email, last_sign_in_at_ts
  FROM "auth"."users"
  WHERE "id" = user_id_fn;

  -- Require a fresh reauthentication (password confirmation)
  IF last_sign_in_at_ts IS NULL OR last_sign_in_at_ts < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'reauth_required' USING ERRCODE = 'P0001';
  END IF;

  -- Fetch the old_record using the specified query format
  SELECT row_to_json(u)::jsonb INTO old_record_json
  FROM (
    SELECT *
    FROM "public"."users"
    WHERE id = user_id_fn
  ) AS u;

  IF old_record_json IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Trigger the queue-based deletion process
  -- This cancels the subscriptions of the user's organizations
  PERFORM "pgmq"."send"(
    'on_user_delete'::text,
    "jsonb_build_object"(
      'payload', "jsonb_build_object"(
        'old_record', old_record_json,
        'table', 'users',
        'type', 'DELETE'
      ),
      'function_name', 'on_user_delete'
    )
  );

  -- Mark the user for deletion
  INSERT INTO "public"."to_delete_accounts" (
    "account_id",
    "removal_date",
    "removed_data"
  ) VALUES
  (
    user_id_fn,
    NOW() + INTERVAL '30 days',
    "jsonb_build_object"('email', user_email, 'apikeys', COALESCE((SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn), '[]'::jsonb))
  );

  -- Delete the API keys
  DELETE FROM "public"."apikeys" WHERE "public"."apikeys"."user_id" = user_id_fn;
END;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_channel_device_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_delta integer;
  v_app_id text;
  v_owner uuid;
  v_device text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := 1;
    v_app_id := NEW.app_id;
    v_owner := NEW.owner_org;
    v_device := NEW.device_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -1;
    v_app_id := OLD.app_id;
    v_owner := OLD.owner_org;
    v_device := OLD.device_id;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pgmq.send(
    'channel_device_counts',
    jsonb_build_object(
      'app_id', v_app_id,
      'owner_org', v_owner,
      'device_id', v_device,
      'delta', v_delta
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."enqueue_channel_device_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_credit_usage_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_total numeric := 0;
  v_available numeric := 0;
  v_available_before numeric := 0;
  v_percent_after numeric := 0;
  v_percent_before numeric := 0;
  v_threshold integer;
  v_alert_cycle integer;
  v_occurred_at timestamptz := COALESCE(NEW.occurred_at, now());
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW.amount IS NULL OR NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(total_credits, 0),
    COALESCE(available_credits, 0)
  INTO v_total, v_available
  FROM public.usage_credit_balances
  WHERE org_id = NEW.org_id;

  v_available := GREATEST(COALESCE(NEW.balance_after, v_available, 0), 0);

  IF v_total <= 0 THEN
    RETURN NEW;
  END IF;

  v_available_before := GREATEST(v_available - NEW.amount, 0);
  IF v_available_before > v_total THEN
    v_available_before := v_total;
  END IF;

  v_percent_after := LEAST(GREATEST(((v_total - v_available) / v_total) * 100, 0), 100);
  v_percent_before := LEAST(GREATEST(((v_total - v_available_before) / v_total) * 100, 0), 100);

  v_alert_cycle := (date_part('year', v_occurred_at)::int * 100) + date_part('month', v_occurred_at)::int;

  FOREACH v_threshold IN ARRAY ARRAY [50, 75, 90, 100]
  LOOP
    IF v_percent_after >= v_threshold AND v_percent_before < v_threshold THEN
      PERFORM pgmq.send(
        'credit_usage_alerts',
        jsonb_build_object(
          'function_name', 'credit_usage_alerts',
          'function_type', NULL,
          'payload', jsonb_build_object(
            'org_id', NEW.org_id,
            'threshold', v_threshold,
            'percent_used', ROUND(v_percent_after, 2),
            'total_credits', v_total,
            'available_credits', v_available,
            'alert_cycle', v_alert_cycle,
            'transaction_id', NEW.id
          )
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_credit_usage_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_v2"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid));
END;  
$$;


ALTER FUNCTION "public"."exist_app_v2"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version));
END;  
$$;


ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM apikey;
  RETURN (SELECT EXISTS (SELECT 1 FROM public.app_versions WHERE app_id=appid AND name=name_version));
END;
$$;


ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_usage_credits"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  grant_rec public.usage_credit_grants%ROWTYPE;
  credits_to_expire numeric;
  balance_after numeric;
  expired_count bigint := 0;
BEGIN
  FOR grant_rec IN
    SELECT *
    FROM public.usage_credit_grants
    WHERE expires_at < now()
      AND credits_total > credits_consumed
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    credits_to_expire := grant_rec.credits_total - grant_rec.credits_consumed;

    UPDATE public.usage_credit_grants
    SET credits_consumed = credits_total
    WHERE id = grant_rec.id;

    SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
    INTO balance_after
    FROM public.usage_credit_grants
    WHERE org_id = grant_rec.org_id
      AND expires_at >= now();

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES (
      grant_rec.org_id,
      grant_rec.id,
      'expiry',
      -credits_to_expire,
      balance_after,
      now(),
      'Expired usage credits',
      jsonb_build_object('reason', 'expiry', 'expires_at', grant_rec.expires_at)
    );

    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END;
$$;


ALTER FUNCTION "public"."expire_usage_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT * FROM public.apikeys
  WHERE key = key_value
     OR key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  LIMIT 1;
$$;


ALTER FUNCTION "public"."find_apikey_by_value"("key_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint DEFAULT 0) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (
    SELECT name
    FROM public.plans
    WHERE (
      plans.mau >= find_best_plan_v3.mau
      AND plans.storage >= find_best_plan_v3.storage
      AND plans.bandwidth >= find_best_plan_v3.bandwidth
      AND plans.build_time_unit >= find_best_plan_v3.build_time_unit
    ) OR plans.name = 'Enterprise'
    ORDER BY plans.mau
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint DEFAULT 0) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY (SELECT plans.name FROM public.plans
    WHERE plans.mau >= find_fit_plan_v3.mau AND plans.storage >= find_fit_plan_v3.storage
      AND plans.bandwidth >= find_fit_plan_v3.bandwidth AND plans.build_time_unit >= find_fit_plan_v3.build_time_unit
      OR plans.name = 'Enterprise'
    ORDER BY plans.mau);
END;
$$;


ALTER FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."force_valid_user_id_on_app"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.user_id = (SELECT created_by FROM public.orgs WHERE id = (NEW."owner_org"));

   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."force_valid_user_id_on_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record record;
BEGIN
    -- Add management_email compared to old fn
    INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * into org_record;
    -- we no longer insert into org_users here. There is a new trigger on "orgs"
    -- INSERT INTO public.org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $$;


ALTER FUNCTION "public"."generate_org_on_user_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_org_user_on_org_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_super_admin_role_id uuid;
BEGIN
  -- Create org_users entry (legacy system)
  INSERT INTO public.org_users (user_id, org_id, user_right)
  VALUES (NEW.created_by, NEW.id, public.rbac_right_super_admin()::"public"."user_min_right");

  -- Get the org_super_admin role ID for role_bindings
  SELECT id INTO org_super_admin_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_super_admin()
  LIMIT 1;

  -- Create role_bindings entry (new RBAC system) if role exists
  IF org_super_admin_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      granted_by,
      granted_at,
      reason,
      is_direct
    ) VALUES (
      public.rbac_principal_user(),
      NEW.created_by,
      org_super_admin_role_id,
      public.rbac_scope_org(),
      NEW.id,
      NEW.created_by, -- The user grants themselves super_admin on their own org
      now(),
      'Auto-granted on org creation',
      true
    )
    -- Only insert if not already exists (in case of re-run or manual entry)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_org_user_on_org_create"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_org_user_on_org_create"() IS 'Creates entries in both org_users (legacy) and role_bindings (RBAC) when an org is created, allowing dual-system operation during transition.';



CREATE OR REPLACE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    solo_plan_stripe_id VARCHAR;
    pending_customer_id VARCHAR;
    trial_at_date TIMESTAMPTZ;
BEGIN
    INSERT INTO public.org_users (user_id, org_id, user_right) 
    VALUES (NEW.created_by, NEW.id, 'super_admin'::"public"."user_min_right");
    
    IF NEW.customer_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    SELECT stripe_id INTO solo_plan_stripe_id 
    FROM public.plans 
    WHERE name = 'Solo' 
    LIMIT 1;
    
    IF solo_plan_stripe_id IS NULL THEN
        RAISE WARNING 'Solo plan not found, skipping sync stripe_info creation for org %', NEW.id;
        RETURN NEW;
    END IF;
    
    pending_customer_id := 'pending_' || NEW.id::text;
    trial_at_date := NOW() + INTERVAL '15 days';
    
    INSERT INTO public.stripe_info (
        customer_id,
        product_id,
        trial_at,
        status,
        is_good_plan
    ) VALUES (
        pending_customer_id,
        solo_plan_stripe_id,
        trial_at_date,
        NULL,
        true
    );
    
    UPDATE public.orgs 
    SET customer_id = pending_customer_id 
    WHERE id = NEW.id;
    
    RETURN NEW;
END $$;


ALTER FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_removal_date"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    removal_date TIMESTAMPTZ;
    auth_uid uuid;
BEGIN
    SELECT auth.uid() INTO auth_uid;
    IF auth_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts
    WHERE account_id = auth_uid;

    IF removal_date IS NULL THEN
        RAISE EXCEPTION 'Account with ID % is not marked for deletion', auth_uid;
    END IF;

    RETURN removal_date;
END;
$$;


ALTER FUNCTION "public"."get_account_removal_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apikey"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='apikey');
END;
$$;


ALTER FUNCTION "public"."get_apikey"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apikey_header"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  headers_text text;
BEGIN
  headers_text := "current_setting"('request.headers'::"text", true);
  
  IF headers_text IS NULL OR headers_text = '' THEN
    RETURN NULL;
  END IF;
  
  BEGIN
    RETURN (headers_text::"json" ->> 'capgkey'::"text");
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;


ALTER FUNCTION "public"."get_apikey_header"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") RETURNS TABLE("id" "uuid", "principal_type" "text", "principal_id" "uuid", "principal_name" "text", "role_id" "uuid", "role_name" "text", "role_description" "text", "granted_at" timestamp with time zone, "granted_by" "uuid", "expires_at" timestamp with time zone, "reason" "text", "is_direct" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_app_id_string text;
BEGIN
  -- Get org_id and app_id string from app
  SELECT a.owner_org, a.app_id INTO v_org_id, v_app_id_string
  FROM public.apps a
  WHERE a.id = p_app_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'APP_NOT_FOUND';
  END IF;

  -- Check if user has permission to view app access
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_app_read(), auth.uid(), v_org_id, v_app_id_string, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_ACCESS';
  END IF;

  -- Return app access with enriched data
  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name
      ELSE rb.principal_id::text
    END as principal_name,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.scope_type = public.rbac_scope_app()
    AND rb.app_id = p_app_id
  ORDER BY rb.granted_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") IS 'Retrieves all access bindings for an app with permission checks. Requires app.read permission.';



CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE cycle_start timestamptz; cycle_end timestamptz;
BEGIN
  SELECT subscription_anchor_start, subscription_anchor_end INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);
  RETURN QUERY SELECT * FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;


ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    cache_entry public.app_metrics_cache%ROWTYPE;
    org_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.orgs WHERE id = get_app_metrics.org_id
    ) INTO org_exists;

    IF NOT org_exists THEN
        RETURN;
    END IF;

    SELECT *
    INTO cache_entry
    FROM public.app_metrics_cache
    WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

    IF cache_entry.id IS NULL
        OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
        OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
        OR cache_entry.cached_at IS NULL
        OR cache_entry.cached_at < (now() - interval '5 minutes') THEN
        cache_entry := public.seed_get_app_metrics_caches(get_app_metrics.org_id, get_app_metrics.start_date, get_app_metrics.end_date);
    END IF;

    IF cache_entry.response IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        metrics.app_id,
        metrics.date,
        metrics.mau,
        metrics.storage,
        metrics.bandwidth,
        metrics.build_time_unit,
        metrics.get,
        metrics.fail,
        metrics.install,
        metrics.uninstall
    FROM jsonb_to_recordset(cache_entry.response) AS metrics(
        app_id character varying,
        date date,
        mau bigint,
        storage bigint,
        bandwidth bigint,
        build_time_unit bigint,
        get bigint,
        fail bigint,
        install bigint,
        uninstall bigint
    )
    ORDER BY metrics.app_id, metrics.date;
END;
$$;


ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT id
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(SELECT public.get_user_main_org_id_by_app_id(appid))
  AND public.is_member_of_org(public.get_user_id(apikey), (SELECT public.get_user_main_org_id_by_app_id(appid)))
  );
END;  
$$;


ALTER FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;


ALTER FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN 
  (SELECT name
  FROM public.plans
    WHERE stripe_id=(SELECT product_id
    FROM public.stripe_info
    WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid)
    ));
END;  
$$;


ALTER FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_counts"() RETURNS TABLE("yearly" bigint, "monthly" bigint, "total" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH ActiveSubscriptions AS (
    -- Get the most recent subscription for each customer
    SELECT DISTINCT ON (customer_id)
      customer_id,
      price_id,
      status,
      trial_at
    FROM public.stripe_info
    WHERE status = 'succeeded'
    ORDER BY customer_id, created_at DESC
  )
  SELECT
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_y_id FROM public.plans WHERE price_y_id IS NOT NULL) 
      THEN 1 
    END) AS yearly,
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_m_id FROM public.plans WHERE price_m_id IS NOT NULL) 
      THEN 1 
    END) AS monthly,
    COUNT(*) AS total
  FROM ActiveSubscriptions s;
END;
$$;


ALTER FUNCTION "public"."get_customer_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") RETURNS TABLE("subscription_anchor_start" timestamp with time zone, "subscription_anchor_end" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    customer_id_var text;
    stripe_info_row public.stripe_info%ROWTYPE;
    anchor_day INTERVAL;
    start_date timestamp with time zone;
    end_date timestamp with time zone;
BEGIN
    SELECT customer_id INTO customer_id_var FROM public.orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    SELECT * INTO stripe_info_row FROM public.stripe_info WHERE customer_id = customer_id_var;

    -- Extract the day of the month FROM public.subscription_anchor_start as an INTERVAL, default to '0 DAYS' if null
    anchor_day := COALESCE(stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start), '0 DAYS'::INTERVAL);

    -- Determine the start date based on the anchor day and current date
    IF anchor_day > now() - date_trunc('MONTH', now()) THEN
        start_date := date_trunc('MONTH', now() - INTERVAL '1 MONTH') + anchor_day;
    ELSE
        start_date := date_trunc('MONTH', now()) + anchor_day;
    END IF;

    -- Calculate the end date
    end_date := start_date + INTERVAL '1 MONTH';

    RETURN QUERY
    SELECT start_date, end_date;
END;
$$;


ALTER FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_db_url"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='db_url');
END;
$$;


ALTER FUNCTION "public"."get_db_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM public.get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;


ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        metrics.date,
        SUM(metrics.mau)::bigint AS mau,
        SUM(metrics.storage)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        public.get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$$;


ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    auth_uid uuid;
BEGIN
  SELECT auth.uid() into auth_uid;

  -- JWT auth.uid is not null, return
  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  -- JWT is null
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
BEGIN
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RETURN NULL;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    api_key_text text;
    api_key record;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RETURN NULL;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
BEGIN
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_ORG_NO_AUTH', jsonb_build_object('org_id', org_id));
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    -- Check org restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: IDENTITY_ORG_UNALLOWED', jsonb_build_object('org_id', org_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_ORG_NO_MATCH', jsonb_build_object('org_id', org_id));
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
BEGIN
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_APP_NO_AUTH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id, 'app_id', app_id));
      RETURN NULL;
    END IF;

    -- Check org restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: IDENTITY_APP_ORG_UNALLOWED', jsonb_build_object('org_id', org_id, 'app_id', app_id));
        RETURN NULL;
      END IF;
    END IF;

    -- Check app restrictions
    IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
      IF NOT (app_id = ANY(api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: IDENTITY_APP_UNALLOWED', jsonb_build_object('app_id', app_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_APP_NO_MATCH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") RETURNS TABLE("org_name" "text", "org_logo" "text", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.name AS org_name,
    o.logo AS org_logo,
    COALESCE(tmp.rbac_role_name, tmp.role::text) AS role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  parts text[];
  minute_pattern text;
  hour_pattern text;
  next_minute int;
  next_hour int;
  next_time timestamptz;
BEGIN
  parts := regexp_split_to_array(p_schedule, '\s+');
  minute_pattern := parts[1];
  hour_pattern := parts[2];
  next_minute := public.get_next_cron_value(minute_pattern, EXTRACT(MINUTE FROM p_timestamp)::int, 60);
  next_hour := public.get_next_cron_value(hour_pattern, EXTRACT(HOUR FROM p_timestamp)::int, 24);
  next_time := date_trunc('hour', p_timestamp) + make_interval(hours => next_hour - EXTRACT(HOUR FROM p_timestamp)::int, mins => next_minute);
  IF next_time <= p_timestamp THEN
    IF hour_pattern LIKE '*/%' THEN
      next_time := next_time + make_interval(hours => public.parse_step_pattern(hour_pattern));
    ELSIF minute_pattern LIKE '*/%' THEN
      next_time := next_time + make_interval(mins => public.parse_step_pattern(minute_pattern));
    ELSE
      next_time := next_time + interval '1 day';
    END IF;
  END IF;
  RETURN next_time;
END;
$$;


ALTER FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF pattern = '*' THEN
    RETURN current_val;
  ELSIF pattern LIKE '*/%' THEN
    DECLARE step int := public.parse_step_pattern(pattern);
            temp_next int := current_val + (step - (current_val % step));
    BEGIN
      IF temp_next >= max_val THEN RETURN step; ELSE RETURN temp_next; END IF;
    END;
  ELSE
    RETURN pattern::int;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_stats_update_date"("org" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  cron_schedule constant text := '0 3 * * *';
  next_run timestamptz;
  preceding_count integer := 0;
  is_target boolean := false;
BEGIN
  next_run := public.get_next_cron_time(cron_schedule, now());
  WITH paying_orgs AS (
    SELECT o.id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      -- Paying customers with active subscription
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > next_run)
        AND si.subscription_anchor_end > next_run)
      -- Trial customers
      OR si.trial_at > next_run
    )
    ORDER BY o.id ASC
  )
  SELECT
    COUNT(*) FILTER (WHERE id < org)::int,
    COALESCE(BOOL_OR(id = org), false)
  INTO preceding_count, is_target
  FROM paying_orgs;

  IF NOT is_target THEN
    RETURN NULL;
  END IF;

  RETURN next_run + make_interval(mins => preceding_count * 4);
END;
$$;


ALTER FUNCTION "public"."get_next_stats_update_date"("org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("total_build_time_unit" bigint, "total_builds" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint, COALESCE(SUM(dbt.build_count), 0)::bigint
  FROM public.daily_build_time dbt
  INNER JOIN public.apps a ON a.app_id = dbt.app_id
  WHERE a.owner_org = p_org_id AND dbt.date >= p_start_date AND dbt.date <= p_end_date;
END;
$$;


ALTER FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right", "is_tmp" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get user ID supporting both JWT and API key authentication
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

  IF NOT (public.check_min_rights('read'::public.user_min_right, v_user_id, get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id));
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY SELECT * FROM public.get_org_members(v_user_id, get_org_members.guild_id);
END;
$$;


ALTER FUNCTION "public"."get_org_members"("guild_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right", "is_tmp" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM user_id;
  RETURN QUERY
    -- Get existing org members
    SELECT o.id AS aid, users.id AS uid, users.email, users.image_url, o.user_right AS role, false AS is_tmp
    FROM public.org_users o
    JOIN public.users ON users.id = o.user_id
    WHERE o.org_id = get_org_members.guild_id
    AND public.is_member_of_org(users.id, o.org_id)
  UNION
    -- Get pending invitations from tmp_users
    SELECT
      ((SELECT COALESCE(MAX(id), 0) FROM public.org_users) + tmp.id)::bigint AS aid,
      tmp.future_uuid AS uid,
      tmp.email::varchar,
      ''::varchar AS image_url,
      public.transform_role_to_invite(tmp.role) AS role,
      true AS is_tmp
    FROM public.tmp_users tmp
    WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" character varying, "image_url" character varying, "role_name" "text", "role_id" "uuid", "binding_id" "uuid", "granted_at" timestamp with time zone, "is_invite" boolean, "is_tmp" boolean, "org_user_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_text text;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;

  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  RETURN QUERY
  WITH rbac_members AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      r.name AS role_name,
      rb.role_id,
      rb.id AS binding_id,
      rb.granted_at,
      false AS is_invite,
      false AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.users u
    INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE r.scope_type = public.rbac_scope_org()
      AND r.name LIKE 'org_%'
  ),
  legacy_invites AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      COALESCE(
        ou.rbac_role_name,
        CASE public.transform_role_to_non_invite(ou.user_right)
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      ou.created_at AS granted_at,
      true AS is_invite,
      false AS is_tmp,
      ou.id AS org_user_id
    FROM public.org_users ou
    INNER JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = p_org_id
      AND ou.user_right::text LIKE 'invite_%'
  ),
  tmp_invites AS (
    SELECT
      tmp.future_uuid AS user_id,
      tmp.email,
      ''::character varying AS image_url,
      COALESCE(
        tmp.rbac_role_name,
        CASE tmp.role
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      GREATEST(tmp.updated_at, tmp.created_at) AS granted_at,
      true AS is_invite,
      true AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.tmp_users tmp
    WHERE tmp.org_id = p_org_id
      AND tmp.cancelled_at IS NULL
      AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days')
  )
  SELECT *
  FROM (
    SELECT * FROM rbac_members
    UNION ALL
    SELECT * FROM legacy_invites
    UNION ALL
    SELECT * FROM tmp_invites
  ) AS combined
  ORDER BY
    combined.is_invite,
    CASE combined.role_name
      WHEN public.rbac_role_org_super_admin() THEN 1
      WHEN public.rbac_role_org_admin() THEN 2
      WHEN public.rbac_role_org_billing_admin() THEN 3
      WHEN public.rbac_role_org_member() THEN 4
      ELSE 5
    END,
    combined.email;
END;
$$;


ALTER FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") IS '
Returns organization members and pending invites with their RBAC roles. Requires
org.read permission.
';



CREATE OR REPLACE FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
BEGIN
  SELECT apps.user_id FROM public.apps WHERE apps.app_id=get_org_owner_id.app_id INTO org_owner_id;
  SELECT public.get_user_main_org_id_by_app_id(app_id) INTO org_id;

  SELECT user_id
  INTO real_user_id
  FROM public.apikeys
  WHERE key=apikey;

  IF (public.is_member_of_org(real_user_id, org_id) IS FALSE)
  THEN
    PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('app_id', get_org_owner_id.app_id, 'org_id', org_id, 'real_user_id', real_user_id));
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
END;
$$;


ALTER FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
<<get_org_perm_for_apikey>>
DECLARE
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT public.get_user_id(apikey) INTO apikey_user_id;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org FROM public.apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'NO_APP';
  END IF;

  SELECT user_right FROM public.org_users
  INTO user_perm
  WHERE user_id=apikey_user_id
  AND org_users.org_id=get_org_perm_for_apikey.org_id;

  IF user_perm IS NULL THEN
    PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
    RETURN 'perm_none';
  END IF;

  -- For compatibility reasons if you are a super_admin we will return "owner"
  -- The old cli relies on this behaviour, on get_org_perm_for_apikey_v2 we will change that
  IF user_perm='super_admin'::"public"."user_min_right" THEN
    RETURN 'perm_owner';
  END IF;

  RETURN format('perm_%s', user_perm);
END;$$;


ALTER FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS TABLE("id" "uuid", "principal_type" "text", "principal_id" "uuid", "role_id" "uuid", "role_name" "text", "role_description" "text", "scope_type" "text", "org_id" "uuid", "app_id" "uuid", "channel_id" "uuid", "granted_at" timestamp with time zone, "granted_by" "uuid", "expires_at" timestamp with time zone, "reason" "text", "is_direct" boolean, "principal_name" "text", "user_email" "text", "group_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if user has permission to view org or if it's their own bindings
  IF auth.uid() != p_user_id AND NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL::text, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  -- Return user's org bindings with enriched data
  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.scope_type,
    rb.org_id,
    rb.app_id,
    rb.channel_id,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email::text
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name::text
      ELSE rb.principal_id::text
    END as principal_name,
    u.email::text as user_email,
    g.name::text as group_name
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.org_id = p_org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = p_user_id
  ORDER BY rb.granted_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") RETURNS "jsonb"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE messages jsonb[] := ARRAY[]::jsonb[]; has_read_access boolean;
BEGIN
  PERFORM cli_version;
  SELECT public.check_min_rights('read'::public.user_min_right, public.get_identity_apikey_only('{write,all,upload,read}'::public.key_mode[]), orgid, NULL::varchar, NULL::bigint) INTO has_read_access;
  IF NOT has_read_access THEN
    messages := array_append(messages, jsonb_build_object('message','API key does not have read access to this organization','fatal',true));
    RETURN messages;
  END IF;
  IF (public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::public.action_type[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::public.action_type[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::public.action_type[]) = false) THEN
    messages := array_append(messages, jsonb_build_object('message','You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your plan, please upgrade your plan here: https://console.capgo.app/settings/plans.','fatal',true));
  END IF;
  RETURN messages;
END;
$$;


ALTER FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "use_new_rbac" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  user_id := NULL;

  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    user_id := api_key.user_id;

    -- Check limited_to_orgs only if api_key exists and has restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      return query select orgs.* FROM public.get_orgs_v6(user_id) orgs
      where orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  -- If no valid API key user_id yet, try to get FROM public.identity
  IF user_id IS NULL THEN
    SELECT public.get_identity() into user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  return query select * FROM public.get_orgs_v6(user_id);
END;
$$;


ALTER FUNCTION "public"."get_orgs_v6"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_orgs_v6"() IS 'Get organizations for authenticated user or API key, including use_new_rbac flag';



CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "use_new_rbac" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id AS gid,
    sub.created_by,
    sub.logo,
    sub.name,
    org_users.user_right::varchar AS role,
    public.is_paying_org(sub.id) AS paying,
    public.is_trial_org(sub.id) AS trial_left,
    public.is_allowed_action_org(sub.id) AS can_use_more,
    public.is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM public.apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email AS management_email,
    public.is_org_yearly(sub.id) AS is_yearly,
    sub.use_new_rbac AS use_new_rbac
  FROM (
    SELECT public.get_cycle_info_org(o.id) AS f, o.* FROM public.orgs AS o
  ) sub
  JOIN public.org_users ON (org_users."user_id" = get_orgs_v6.userid AND sub.id = org_users."org_id");
END;
$$;


ALTER FUNCTION "public"."get_orgs_v6"("userid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") IS 'Get organizations for a user, including use_new_rbac flag for per-org RBAC rollout';



CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying, "use_new_rbac" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  user_id := NULL;

  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RAISE EXCEPTION 'API key has expired';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v7(user_id) AS orgs
      WHERE orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  IF user_id IS NULL THEN
    SELECT public.get_identity() INTO user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.get_orgs_v7(user_id);
END;
$$;


ALTER FUNCTION "public"."get_orgs_v7"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying, "use_new_rbac" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) as cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  rbac_roles AS (
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION ALL
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  rbac_org_roles AS (
    SELECT org_id, (ARRAY_AGG(rbac_roles.name ORDER BY rbac_roles.priority_rank DESC))[1] AS role_name
    FROM rbac_roles
    GROUP BY org_id
  ),
  user_orgs AS (
    SELECT ou.org_id
    FROM public.org_users ou
    WHERE ou.user_id = userid
    UNION
    SELECT rbac_org_roles.org_id
    FROM rbac_org_roles
  ),
  -- Compute next stats update info for all paying orgs at once
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
        AND si.subscription_anchor_end > NOW())
      OR si.trial_at > NOW()
    )
  ),
  -- Calculate current billing cycle for each org
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > NOW() - date_trunc('MONTH', NOW())
        THEN date_trunc('MONTH', NOW() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', NOW())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  ),
  -- Calculate password policy access status for user/org combinations
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    CASE
      WHEN o.use_new_rbac AND ou.user_right::text LIKE 'invite_%' THEN ou.user_right::varchar
      WHEN o.use_new_rbac THEN COALESCE(ror.role_name, ou.rbac_role_name, ou.user_right::varchar)
      ELSE COALESCE(ou.user_right::varchar, ror.role_name)
    END AS role,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - NOW()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.available_credits, 0)
    END AS credit_available,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.total_credits, 0)
    END AS credit_total,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE ucb.next_expiration
    END AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles,
    o.required_encryption_key,
    o.use_new_rbac
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  LEFT JOIN rbac_org_roles ror ON ror.org_id = o.id
  LEFT JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;


ALTER FUNCTION "public"."get_orgs_v7"("userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    IF policy_config IS NULL THEN
        RETURN NULL;
    END IF;
    -- Create a deterministic hash of the policy config
    RETURN md5(policy_config::text);
END;
$$;


ALTER FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  v_anchor_day INTERVAL;
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
BEGIN
  -- Single query for org/stripe info and plan limits (get anchor day for cycle calculation)
  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL),
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  -- Calculate current billing cycle dates based on anchor day
  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

  -- Get metrics using optimized function
  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  -- Calculate percentages
  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  total_stats RECORD;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
BEGIN
  -- Single query for plan limits (inlined get_current_plan_max_org)
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  -- Get metrics for specified cycle
  SELECT * INTO total_stats
  FROM public.get_total_metrics(orgid, cycle_start, cycle_end);

  -- Calculate percentages
  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;


ALTER FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_anchor_day INTERVAL;
BEGIN
    -- Get anchor day for cycle calculation (properly inlined get_cycle_info_org)
    SELECT
        COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
    INTO v_anchor_day
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE o.id = org_id;

    -- Calculate current billing cycle dates based on anchor day
    IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
        v_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + v_anchor_day)::date;
    ELSE
        v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
    END IF;
    v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

    RETURN QUERY SELECT * FROM public.get_total_metrics(org_id, v_start_date, v_end_date);
END;
$$;


ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_mau bigint;
    v_bandwidth bigint;
    v_build_time bigint;
    v_get bigint;
    v_fail bigint;
    v_install bigint;
    v_uninstall bigint;
    v_storage bigint;
BEGIN
    -- Get all app_ids for this org (active + deleted)
    -- Aggregate each metric table separately to avoid Cartesian product

    -- MAU
    SELECT COALESCE(SUM(dm.mau), 0)::bigint INTO v_mau
    FROM public.daily_mau dm
    WHERE dm.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dm.date BETWEEN start_date AND end_date;

    -- Bandwidth
    SELECT COALESCE(SUM(db.bandwidth), 0)::bigint INTO v_bandwidth
    FROM public.daily_bandwidth db
    WHERE db.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND db.date BETWEEN start_date AND end_date;

    -- Build time
    SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint INTO v_build_time
    FROM public.daily_build_time dbt
    WHERE dbt.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dbt.date BETWEEN start_date AND end_date;

    -- Version stats (get, fail, install, uninstall)
    SELECT
        COALESCE(SUM(dv.get), 0)::bigint,
        COALESCE(SUM(dv.fail), 0)::bigint,
        COALESCE(SUM(dv.install), 0)::bigint,
        COALESCE(SUM(dv.uninstall), 0)::bigint
    INTO v_get, v_fail, v_install, v_uninstall
    FROM public.daily_version dv
    WHERE dv.app_id IN (
        SELECT apps.app_id FROM public.apps WHERE apps.owner_org = org_id
        UNION
        SELECT deleted_apps.app_id FROM public.deleted_apps WHERE deleted_apps.owner_org = org_id
    )
    AND dv.date BETWEEN start_date AND end_date;

    -- Storage is calculated separately (current total, not time-series)
    SELECT COALESCE(SUM(avm.size), 0)::bigint INTO v_storage
    FROM public.app_versions av
    INNER JOIN public.app_versions_meta avm ON av.id = avm.id
    WHERE av.owner_org = org_id AND av.deleted = false;

    RETURN QUERY SELECT v_mau, v_storage, v_bandwidth, v_build_time, v_get, v_fail, v_install, v_uninstall;
END;
$$;


ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;


ALTER FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_update_stats"() RETURNS TABLE("app_id" character varying, "failed" bigint, "install" bigint, "get" bigint, "success_rate" numeric, "healthy" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            version_usage.app_id,
            COALESCE(SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END), 0) AS failed,
            COALESCE(SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END), 0) AS install,
            COALESCE(SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END), 0) AS get
        FROM
            public.version_usage
        WHERE
            timestamp >= (date_trunc('minute', now()) - INTERVAL '10 minutes')
            AND timestamp < (date_trunc('minute', now()) - INTERVAL '9 minutes')
        GROUP BY
            version_usage.app_id
    )
    SELECT
        stats.app_id,
        stats.failed,
        stats.install,
        stats.get,
        CASE
            WHEN (stats.install + stats.get) > 0 THEN
                ROUND((stats.get::numeric / (stats.install + stats.get)) * 100, 2)
            ELSE 100
        END AS success_rate,
        CASE
            WHEN (stats.install + stats.get) > 0 THEN
                ((stats.get::numeric / (stats.install + stats.get)) * 100 >= 70)
            ELSE true
        END AS healthy
    FROM
        stats
    WHERE
        stats.get > 0;
END;
$$;


ALTER FUNCTION "public"."get_update_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  IF api_key.id IS NOT NULL THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN NULL;
    END IF;
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_id"("apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE real_user_id uuid;
BEGIN
  PERFORM app_id;
  SELECT public.get_user_id(apikey) INTO real_user_id;
  RETURN real_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
BEGIN
  SELECT orgs.id FROM public.orgs
  INTO org_id
  WHERE orgs.created_by=get_user_main_org_id.user_id
  LIMIT 1;

  RETURN org_id;
END;
$$;


ALTER FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  auth_uid uuid;
  auth_role text;
  api_user_id uuid;
BEGIN
  SELECT apps.owner_org INTO org_id
  FROM public.apps
  WHERE ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Allow trusted DB roles (seed/migrations) without JWT context
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN org_id;
  END IF;

  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    IF public.check_min_rights('read'::public.user_min_right, auth_uid, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
      RETURN org_id;
    END IF;
    RETURN NULL;
  END IF;

  SELECT auth.role() INTO auth_role;
  IF auth_role = 'service_role' THEN
    RETURN org_id;
  END IF;

  SELECT public.get_identity_org_appid('{read,upload,write,all}'::public.key_mode[], org_id, get_user_main_org_id_by_app_id.app_id) INTO api_user_id;
  IF api_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.check_min_rights('read'::public.user_min_right, api_user_id, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
    RETURN org_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_ids"() RETURNS TABLE("org_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_text text;
  api_key record;
  v_user_id uuid;
  limited_orgs uuid[];
  has_limited_orgs boolean := false;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  v_user_id := NULL;

  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    v_user_id := api_key.user_id;
    limited_orgs := api_key.limited_to_orgs;
    has_limited_orgs := COALESCE(array_length(limited_orgs, 1), 0) > 0;
  END IF;

  -- If no valid API key v_user_id yet, try to get FROM public.identity
  IF v_user_id IS NULL THEN
    SELECT public.get_identity() into v_user_id;

    IF v_user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY
  WITH role_orgs AS (
    -- Direct role bindings on org scope
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Group role bindings on org scope
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- App scope bindings (user)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- App scope bindings (group)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Channel scope bindings (user)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Channel scope bindings (group)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  legacy_orgs AS (
    SELECT org_users.org_id AS org_uuid
    FROM public.org_users
    WHERE org_users.user_id = v_user_id
  ),
  all_orgs AS (
    SELECT org_uuid FROM legacy_orgs
    UNION
    SELECT org_uuid FROM role_orgs
  )
  SELECT ao.org_uuid AS org_id
  FROM all_orgs ao
  WHERE ao.org_uuid IS NOT NULL
    AND (
      NOT has_limited_orgs
      OR ao.org_uuid = ANY(limited_orgs)
    );
END;
$$;


ALTER FUNCTION "public"."get_user_org_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_org_ids"() IS 'RBAC/legacy-aware org id list for authenticated user or API key (includes org_users and role_bindings membership).';



CREATE TABLE IF NOT EXISTS "public"."app_versions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "name" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false NOT NULL,
    "external_url" character varying,
    "checksum" character varying,
    "session_key" character varying,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
    "min_update_version" character varying,
    "native_packages" "jsonb"[],
    "owner_org" "uuid" NOT NULL,
    "user_id" "uuid",
    "r2_path" character varying,
    "manifest" "public"."manifest_entry"[],
    "link" "text",
    "comment" "text",
    "manifest_count" integer DEFAULT 0 NOT NULL,
    "key_id" character varying(20),
    "cli_version" character varying,
    "deleted_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."app_versions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."app_versions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_versions"."key_id" IS 'First 4 characters of the base64-encoded public key used to encrypt this bundle (identifies which key was used for encryption)';



COMMENT ON COLUMN "public"."app_versions"."cli_version" IS 'The version of @capgo/cli used to upload this bundle';



CREATE OR REPLACE FUNCTION "public"."get_versions_with_no_metadata"() RETURNS SETOF "public"."app_versions"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT app_versions.* FROM public.app_versions
  LEFT JOIN public.app_versions_meta ON app_versions_meta.id=app_versions.id
  WHERE COALESCE(app_versions_meta.size, 0) = 0
  AND app_versions.deleted=false
  AND app_versions.storage_provider != 'external'
  AND NOW() - app_versions.created_at > interval '120 seconds';
END;
$$;


ALTER FUNCTION "public"."get_versions_with_no_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_weekly_stats"("app_id" character varying) RETURNS TABLE("all_updates" bigint, "failed_updates" bigint, "open_app" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE seven_days_ago DATE;
BEGIN
  seven_days_ago := CURRENT_DATE - INTERVAL '7 days';
  SELECT COALESCE(SUM(install), 0) INTO all_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(fail), 0) INTO failed_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(get), 0) INTO open_app FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  RETURN QUERY SELECT all_updates, failed_updates, open_app;
END;
$$;


ALTER FUNCTION "public"."get_weekly_stats"("app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the current user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors
    WHERE (SELECT auth.uid()) = user_id 
      AND status = 'verified'
  );
END;
$$;


ALTER FUNCTION "public"."has_2fa_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the specified user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors mfa
    WHERE mfa.user_id = has_2fa_enabled.user_id 
      AND mfa.status = 'verified'
  );
END;
$$;


ALTER FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.has_app_right_userid("appid", "right", (SELECT auth.uid()));
END;
$$;


ALTER FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  api_key record;
  allowed boolean;
  use_rbac boolean;
  perm_key text;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id("appid");
  use_rbac := public.rbac_is_enabled_for_org(org_id);

  SELECT * FROM public.apikeys WHERE key = "apikey" INTO api_key;
  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
    IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT ("appid" = ANY(api_key.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF use_rbac THEN
    perm_key := public.rbac_permission_for_legacy("right", public.rbac_scope_app());
    allowed := public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, perm_key, org_id, "appid", NULL::bigint);
  ELSE
    allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
  END IF;

  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', "appid", 'org_id', org_id, 'right', "right"::text, 'userid', "userid", 'rbac', use_rbac));
  END IF;
  RETURN allowed;
END;
$$;


ALTER FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  allowed boolean;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id("appid");

  allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_USERID', jsonb_build_object('appid', "appid", 'org_id', org_id, 'right', "right"::text, 'userid', "userid"));
  END IF;
  RETURN allowed;
END;
$$;


ALTER FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  calling_user_id uuid;
BEGIN
  -- Get the calling user's ID
  SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)
  INTO calling_user_id;

  -- Check if org exists
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has at least public.rbac_right_admin() rights
  IF NOT public.check_min_rights(public.rbac_right_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
    RETURN 'NO_RIGHTS';
  END IF;

  -- If inviting as super_admin, caller must be super_admin
  IF (invite_type = public.rbac_right_super_admin()::public.user_min_right OR invite_type = public.rbac_right_invite_super_admin()::public.user_min_right) THEN
    IF NOT public.check_min_rights(public.rbac_right_super_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  -- Check if user already exists
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- User exists, check if already in org
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      -- Add user to org
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);
      RETURN 'OK';
    END IF;
  ELSE
    -- User doesn't exist, check tmp_users for pending invitations
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

    IF current_tmp_user IS NOT NULL THEN
      -- Invitation already exists
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Invitation was cancelled, check if recent
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      -- No invitation exists, need to create one (handled elsewhere)
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") IS 'Invite a user to an organization. Admins can invite read/upload/write/admin roles. Super admins can invite super_admin roles.';



CREATE OR REPLACE FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  role_id uuid;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
  api_key_text text;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org_rbac.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  IF NOT public.rbac_is_enabled_for_org(invite_user_to_org_rbac.org_id) THEN
    RETURN 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = invite_user_to_org_rbac.role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF invite_user_to_org_rbac.role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(invite_user_to_org_rbac.role_name);
  invite_right := public.transform_role_to_invite(legacy_right);

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right, rbac_role_name)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_right, invite_user_to_org_rbac.role_name);
      RETURN 'OK';
    END IF;
  ELSE
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org_rbac.email
      AND public.tmp_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") IS '
Invite a user to an organization using RBAC roles while preserving legacy invite
flow.
';



CREATE OR REPLACE FUNCTION "public"."is_account_disabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Check if the user_id exists in the to_delete_accounts table
    RETURN EXISTS (
        SELECT 1 
        FROM public.to_delete_accounts 
        WHERE account_id = user_id
    );
END;
$$;


ALTER FUNCTION "public"."is_account_disabled"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_admin((SELECT auth.uid()));
END;  
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_admin_legacy boolean := false;
  mfa_verified boolean;
  rbac_enabled boolean;
  has_platform_admin boolean := false;
BEGIN
  -- Always check MFA first
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  -- Always check legacy vault list (for bootstrapping and backward compatibility)
  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb
  FROM vault.decrypted_secrets WHERE name = 'admin_users';
  is_admin_legacy := (admin_ids_jsonb ? userid::text);

  -- Check if RBAC is enabled globally
  SELECT use_new_rbac INTO rbac_enabled FROM public.rbac_settings WHERE id = 1;

  IF COALESCE(rbac_enabled, false) THEN
    -- RBAC mode: also check for platform_super_admin role binding
    SELECT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = userid
        AND rb.scope_type = public.rbac_scope_platform()
        AND r.name = public.rbac_role_platform_super_admin()
    ) INTO has_platform_admin;

    -- In RBAC mode: admin if EITHER in vault list OR has platform role
    RETURN is_admin_legacy OR has_platform_admin;
  ELSE
    -- Legacy mode: only use vault secret list
    RETURN is_admin_legacy;
  END IF;
END;
$$;


ALTER FUNCTION "public"."is_admin"("userid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"("userid" "uuid") IS 'Check if user is platform admin. In RBAC mode: checks vault list OR platform_super_admin role (allows bootstrapping). In legacy mode: only checks vault list. Always requires MFA.';



CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM apikey;
  RETURN public.is_allowed_action_org((SELECT owner_org FROM public.apps WHERE app_id=appid));
END;
$$;


ALTER FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org(orgid);
END;
$$;


ALTER FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions);
END;
$$;


ALTER FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  -- Check if key was found and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  -- Check if key was found and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN false;
    END IF;

    -- Check if user is app owner
    IF NOT public.is_app_owner(api_key.user_id, app_id) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;


ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- NULL expires_at means key never expires
  IF key_expires_at IS NULL THEN
    RETURN false;
  END IF;

  -- Check if current time is past expiration
  RETURN now() > key_expires_at;
END;
$$;


ALTER FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_app_owner((SELECT auth.uid()), appid);
END;  
$$;


ALTER FUNCTION "public"."is_app_owner"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.is_app_owner(public.get_user_id(apikey), appid);
END;
$$;


ALTER FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid
  AND user_id=userid));
END;  
$$;


ALTER FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT bandwidth_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_bandwidth_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT build_time_exceeded FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_build_time_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_bundle_encrypted"("session_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- A bundle is considered encrypted if session_key is non-null and non-empty
  RETURN session_key IS NOT NULL AND length(btrim(session_key)) > 0;
END;
$$;


ALTER FUNCTION "public"."is_bundle_encrypted"("session_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_canceled_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid)
  AND status = 'canceled'));
END;  
$$;


ALTER FUNCTION "public"."is_canceled_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics RECORD;
  v_anchor_day INTERVAL;
BEGIN
  -- Get product_id and calculate current billing cycle (properly inlined get_cycle_info_org)
  SELECT
    si.product_id,
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
  INTO v_product_id, v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  -- Calculate current billing cycle dates based on anchor day
  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

  -- Get plan name directly (inlined, avoids get_current_plan_name_org function call)
  SELECT p.name INTO v_plan_name
  FROM public.plans p
  WHERE p.stripe_id = v_product_id;
 
  -- Early exit for Enterprise plans (skip expensive metrics calculation)
  IF v_plan_name = 'Enterprise' THEN
    RETURN TRUE;
  END IF;

  -- Get metrics (uses existing cache via get_total_metrics)
  SELECT * INTO total_metrics
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  -- Direct plan fit check (inlined find_fit_plan_v3 logic)
  RETURN EXISTS (
    SELECT 1 FROM public.plans p
    WHERE p.name = v_plan_name
      AND p.mau >= total_metrics.mau
      AND p.bandwidth >= total_metrics.bandwidth
      AND p.storage >= total_metrics.storage
      AND p.build_time_unit >= COALESCE(total_metrics.build_time_unit, 0)
  );
END;
$$;


ALTER FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT mau_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_mau_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
 is_found integer;
BEGIN
  SELECT count(*)
  INTO is_found
  FROM public.orgs
  JOIN public.org_users on org_users.org_id = orgs.id
  WhERE org_users.user_id = is_member_of_org.user_id AND
  orgs.id = is_member_of_org.org_id;
  RETURN is_found != 0;
END;
$$;


ALTER FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_not_deleted"("email_check" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE  
 is_found integer;
BEGIN
  SELECT count(*)
  INTO is_found
  FROM public.deleted_account
  WHERE email=email_check;
  RETURN is_found = 0;
END; 
$$;


ALTER FUNCTION "public"."is_not_deleted"("email_check" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_numeric"("text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
BEGIN
    RETURN $1 ~ '^[0-9]+$';
END;
$_$;


ALTER FUNCTION "public"."is_numeric"("text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_onboarded_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE owner_org=orgid)) AND (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE owner_org=orgid));
END;
$$;


ALTER FUNCTION "public"."is_onboarded_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (NOT public.is_onboarded_org(orgid)) AND public.is_trial_org(orgid) = 0;
END;
$$;


ALTER FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_yearly"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    is_yearly boolean;
BEGIN
    SELECT 
        CASE
            WHEN si.price_id = p.price_y_id THEN true
            ELSE false
        END INTO is_yearly
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1;

    RETURN COALESCE(is_yearly, false);
END;
$$;


ALTER FUNCTION "public"."is_org_yearly"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid)
  AND (
    (status = 'succeeded' AND is_good_plan = true)
    OR (trial_at::date - (now())::date > 0)
  )
  )
);
END;  
$$;


ALTER FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE org_customer_id text; result boolean;
BEGIN
  SELECT o.customer_id INTO org_customer_id FROM public.orgs o WHERE o.id = orgid;
  SELECT (si.trial_at > now()) OR (si.status = 'succeeded' AND NOT (
      (si.mau_exceeded AND 'mau' = ANY(actions)) OR (si.storage_exceeded AND 'storage' = ANY(actions)) OR
      (si.bandwidth_exceeded AND 'bandwidth' = ANY(actions)) OR (si.build_time_exceeded AND 'build_time' = ANY(actions))))
  INTO result FROM public.stripe_info si WHERE si.customer_id = org_customer_id LIMIT 1;
  RETURN COALESCE(result, false);
END;
$$;


ALTER FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid)
  AND status = 'succeeded'));
END;  
$$;


ALTER FUNCTION "public"."is_paying_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT storage_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_storage_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trial_org"("orgid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  FROM public.stripe_info
  WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid));
END;  
$$;


ALTER FUNCTION "public"."is_trial_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get the org that owns the app
  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check for app-scoped admin roles OR org-scoped admin roles (inheritance)
  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND (
        -- App-scoped bindings
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = p_app_id)
        OR
        -- Org-scoped bindings (inherit org admin to app)
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = v_org_id)
      )
      AND r.name IN (public.rbac_role_app_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin(), public.rbac_role_platform_super_admin())
  );
END;
$$;


ALTER FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks whether a user has an admin role for an app, including inherited org-level admin roles (bypasses RLS to avoid recursion).';



CREATE OR REPLACE FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.org_id = p_org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name IN (public.rbac_role_platform_super_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
$$;


ALTER FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") IS 'Checks whether a user has an admin role in an organization (bypasses RLS to avoid recursion).';



CREATE OR REPLACE FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  update_record public.message_update;
  current_message jsonb;
  current_cf_ids jsonb;
BEGIN
  FOR update_record IN SELECT * FROM unnest(updates)
  LOOP
    -- Get the current message using dynamic SQL
    EXECUTE format(
      'SELECT message FROM pgmq.q_%I WHERE msg_id = $1',
      update_record.queue
    ) INTO current_message USING update_record.msg_id;

    IF current_message IS NOT NULL THEN
      -- Check if cf_ids exists and is an array
      current_cf_ids := current_message->'cf_ids';
      
      IF current_cf_ids IS NULL OR NOT jsonb_typeof(current_cf_ids) = 'array' THEN
        -- Create new cf_ids array with single element
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          jsonb_build_array(update_record.cf_id)
        );
      ELSE
        -- Append new cf_id to existing array
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          current_cf_ids || jsonb_build_array(update_record.cf_id)
        );
      END IF;

      -- Update the message
      EXECUTE format(
        'UPDATE pgmq.q_%I SET message = $1 WHERE msg_id = $2',
        update_record.queue
      ) USING current_message, update_record.msg_id;
    END IF;
  END LOOP;
END;
$_$;


ALTER FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE tmp_user record; non_invite_role public.user_min_right;
BEGIN
  non_invite_role := public.transform_role_to_non_invite(new_role);
  PERFORM 1 FROM public.orgs WHERE public.orgs.id = modify_permissions_tmp.org_id; IF NOT FOUND THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  IF (non_invite_role = 'super_admin'::public.user_min_right) THEN
    IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS_FOR_SUPER_ADMIN'; END IF;
  END IF;
  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = modify_permissions_tmp.email AND public.tmp_users.org_id = modify_permissions_tmp.org_id;
  IF NOT FOUND THEN RETURN 'NO_INVITATION'; END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN RETURN 'INVITATION_CANCELLED'; END IF;
  UPDATE public.tmp_users SET role = non_invite_role, updated_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."noupdate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
    val RECORD;
    is_different boolean;
BEGIN
    -- API key? We do not care
    IF (SELECT auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF public.check_min_rights('admin'::"public"."user_min_right", (SELECT auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    FOR val IN
      SELECT * from json_each_text(row_to_json(NEW))
    LOOP
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) USING NEW, OLD
      INTO is_different;

      IF is_different AND val.key <> 'version' AND val.key <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    END LOOP;

   RETURN NEW;
END;$_$;


ALTER FUNCTION "public"."noupdate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."one_month_ahead"() RETURNS timestamp without time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
   RETURN NOW() + INTERVAL '1 month';
END;
$$;


ALTER FUNCTION "public"."one_month_ahead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    IF field = '*' THEN
        RETURN current_val;
    ELSIF public.is_numeric(field) THEN
        RETURN field::int;
    ELSIF field LIKE '*/%' THEN
        DECLARE
            step int := regexp_replace(field, '\*/(\d+)', '\1')::int;
            next_val int := current_val + (step - (current_val % step));
        BEGIN
            IF next_val >= max_val THEN
                RETURN step;
            ELSE
                RETURN next_val;
            END IF;
        END;
    ELSE
        RETURN 0;
    END IF;
END;
$$;


ALTER FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_step_pattern"("pattern" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (regexp_replace(pattern, '\*/(\d+)', '\1'))::int;
END;
$$;


ALTER FUNCTION "public"."parse_step_pattern"("pattern" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  uid uuid;
  req_id text;
  role text;
  ctx text;
  fn text;
BEGIN
  uid := auth.uid();
  req_id := current_setting('request.header.x-request-id', true);
  role := current_setting('request.jwt.claim.role', true);

  -- Best-effort: extract caller from the PL/pgSQL context
  GET DIAGNOSTICS ctx = PG_CONTEXT;
  fn := (
    SELECT regexp_replace(line, '^PL/pgSQL function ([^(]+\([^)]*\)).*$', '\1')
    FROM regexp_split_to_table(ctx, E'\n') AS line
    WHERE line LIKE 'PL/pgSQL function %'
      AND line NOT ILIKE '%pg_log(%'
      AND line NOT ILIKE '%pg_debug(%'
    LIMIT 1
  );
  IF fn IS NULL THEN
    fn := 'unknown';
  END IF;

  -- Trim overly large payloads to avoid noisy logs
  IF length(coalesce(input::text, '{}')) > 2000 THEN
    input := jsonb_build_object('truncated', true);
  END IF;

  RAISE LOG 'RLS LOG: fn=%, decision=%, uid=%, role=%, req_id=%, input=%'
    , fn
    , decision
    , uid
    , coalesce(role, 'null')
    , coalesce(req_id, 'null')
    , coalesce(input::text, '{}');
EXCEPTION WHEN OTHERS THEN
  -- Never let logging break execution paths
  NULL;
END;
$_$;


ALTER FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_admin_stats"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM pgmq.send('admin_stats', jsonb_build_object('function_name','logsnag_insights','function_type','cloudflare','payload',jsonb_build_object()));
END;
$$;


ALTER FUNCTION "public"."process_admin_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_all_cron_tasks"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
  current_dow int;
  current_day int;
  task RECORD;
  queue_names text[];
  should_run boolean;
  lock_acquired boolean;
BEGIN
  -- Try to acquire an advisory lock (non-blocking)
  -- Lock ID 1 is reserved for process_all_cron_tasks
  -- pg_try_advisory_lock returns true if lock acquired, false if already held
  lock_acquired := pg_try_advisory_lock(1);

  IF NOT lock_acquired THEN
    -- Another instance is already running, skip this execution
    RAISE NOTICE 'process_all_cron_tasks: skipped, another instance is already running';
    RETURN;
  END IF;

  -- Wrap everything in a block so we can ensure the lock is released
  BEGIN
    -- Get current time components in UTC
    current_hour := EXTRACT(HOUR FROM now());
    current_minute := EXTRACT(MINUTE FROM now());
    current_second := EXTRACT(SECOND FROM now());
    current_dow := EXTRACT(DOW FROM now());
    current_day := EXTRACT(DAY FROM now());

    -- Loop through all enabled tasks
    FOR task IN SELECT * FROM public.cron_tasks WHERE enabled = true LOOP
      should_run := false;

      -- Check if task should run based on its schedule
      IF task.second_interval IS NOT NULL THEN
        -- Run every N seconds
        -- Since pg_cron interval is not clock-aligned, we run on every invocation
        -- for second_interval tasks (the cron job itself runs every 10 seconds)
        should_run := true;
      ELSIF task.minute_interval IS NOT NULL THEN
        -- Run every N minutes
        -- Use current_second < 10 to catch first run of each minute (works with any cron offset)
        should_run := (current_minute % task.minute_interval = 0)
                      AND (current_second < 10);
      ELSIF task.hour_interval IS NOT NULL THEN
        -- Run every N hours at specific minute
        -- Use current_second < 10 to catch first run
        should_run := (current_hour % task.hour_interval = 0)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);
      ELSIF task.run_at_hour IS NOT NULL THEN
        -- Run at specific time
        -- Use current_second < 10 to catch first run
        should_run := (current_hour = task.run_at_hour)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);

        -- Check day of week constraint
        IF should_run AND task.run_on_dow IS NOT NULL THEN
          should_run := (current_dow = task.run_on_dow);
        END IF;

        -- Check day of month constraint
        IF should_run AND task.run_on_day IS NOT NULL THEN
          should_run := (current_day = task.run_on_day);
        END IF;
      END IF;

      -- Execute the task if it should run
      IF should_run THEN
        BEGIN
          CASE task.task_type
            WHEN 'function' THEN
              EXECUTE 'SELECT ' || task.target;

            WHEN 'queue' THEN
              PERFORM pgmq.send(
                task.target,
                COALESCE(task.payload, jsonb_build_object('function_name', task.target))
              );

            WHEN 'function_queue' THEN
              -- Parse JSON array of queue names
              SELECT array_agg(value::text) INTO queue_names
              FROM jsonb_array_elements_text(task.target::jsonb);

              IF task.batch_size IS NOT NULL THEN
                PERFORM public.process_function_queue(queue_names, task.batch_size);
              ELSE
                PERFORM public.process_function_queue(queue_names);
              END IF;
          END CASE;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'cron task "%" failed: %', task.name, SQLERRM;
        END;
      END IF;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    -- Release the lock even if an error occurred
    PERFORM pg_advisory_unlock(1);
    RAISE;
  END;

  -- Release the advisory lock
  PERFORM pg_advisory_unlock(1);
END;
$$;


ALTER FUNCTION "public"."process_all_cron_tasks"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_all_cron_tasks"() IS 'Consolidated cron task processor that runs every 10 seconds. Uses advisory lock (ID=1) to prevent concurrent execution - if a previous run is still executing, the new invocation will skip.';



CREATE OR REPLACE FUNCTION "public"."process_billing_period_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  -- Find all orgs whose billing cycle ends today
  -- We calculate the PREVIOUS cycle's dates to ensure we report on completed data
  FOR org_record IN (
    SELECT
      o.id AS org_id,
      o.management_email,
      si.subscription_anchor_start,
      -- Calculate the previous billing cycle dates
      -- We use (now() - interval '1 day') to get yesterday's cycle end date calculation
      -- This ensures we're always looking at the just-completed cycle
      CASE
        WHEN COALESCE(
          si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start),
          '0 DAYS'::INTERVAL
        ) > (now() - interval '1 day') - date_trunc('MONTH', now() - interval '1 day')
        THEN date_trunc('MONTH', (now() - interval '1 day') - INTERVAL '1 MONTH') +
             COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', now() - interval '1 day') +
             COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS prev_cycle_start,
      CASE
        WHEN COALESCE(
          si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start),
          '0 DAYS'::INTERVAL
        ) > (now() - interval '1 day') - date_trunc('MONTH', now() - interval '1 day')
        THEN (date_trunc('MONTH', (now() - interval '1 day') - INTERVAL '1 MONTH') +
              COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)) + INTERVAL '1 MONTH'
        ELSE (date_trunc('MONTH', now() - interval '1 day') +
              COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)) + INTERVAL '1 MONTH'
      END AS prev_cycle_end
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
      AND o.management_email IS NOT NULL
  )
  LOOP
    -- If today is the billing cycle end date, queue the email
    -- We pass the calculated previous cycle dates to ensure correct data
    IF org_record.prev_cycle_end::date = CURRENT_DATE THEN
      PERFORM pgmq.send('cron_email',
        jsonb_build_object(
          'function_name', 'cron_email',
          'function_type', 'cloudflare',
          'payload', jsonb_build_object(
            'email', org_record.management_email,
            'orgId', org_record.org_id,
            'type', 'billing_period_stats',
            'cycleStart', org_record.prev_cycle_start,
            'cycleEnd', org_record.prev_cycle_end
          )
        )
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_billing_period_stats_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer DEFAULT 1000) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  message_record RECORD;
  v_payload jsonb;
  v_app_id text;
  v_delta integer;
  msg_ids bigint[] := ARRAY[]::bigint[];
  processed bigint := 0;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 THEN
    batch_size := 100;
  END IF;

  FOR message_record IN
    SELECT *
    FROM pgmq.read('channel_device_counts', 60, batch_size)
  LOOP
    v_payload := message_record.message;
    v_app_id := v_payload ->> 'app_id';
    v_delta := COALESCE((v_payload ->> 'delta')::integer, 0);

    IF v_app_id IS NULL OR v_delta = 0 THEN
      msg_ids := array_append(msg_ids, message_record.msg_id);
      CONTINUE;
    END IF;

    UPDATE public.apps
    SET channel_device_count = GREATEST(channel_device_count + v_delta, 0),
        updated_at = now()
    WHERE app_id = v_app_id;

    processed := processed + 1;
    msg_ids := array_append(msg_ids, message_record.msg_id);
  END LOOP;

  IF array_length(msg_ids, 1) IS NOT NULL THEN
    PERFORM pgmq.delete('channel_device_counts', msg_ids);
  END IF;

  RETURN processed;
END;
$$;


ALTER FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM public.app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'

    UNION

    SELECT DISTINCT dm.app_id, av.owner_org
    FROM public.daily_mau dm
    JOIN public.app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
  )
  LOOP
    PERFORM pgmq.send('cron_stat_app',
      jsonb_build_object(
        'function_name', 'cron_stat_app',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'appId', app_record.app_id,
          'orgId', app_record.owner_org,
          'todayOnly', false
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_cron_stats_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_cron_sync_sub_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    org_record RECORD;
BEGIN
    -- Process each organization that has a customer_id (paying customers only)
    FOR org_record IN 
        SELECT DISTINCT o.id, si.customer_id
        FROM public.orgs o
        INNER JOIN public.stripe_info si ON o.customer_id = si.customer_id
        WHERE o.customer_id IS NOT NULL 
          AND si.customer_id IS NOT NULL
    LOOP
        -- Queue sync_sub processing for this organization
        PERFORM pgmq.send('cron_sync_sub',
            json_build_object(
                'function_name', 'cron_sync_sub',
                'orgId', org_record.id,
                'customerId', org_record.customer_id
            )::jsonb
        );
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_cron_sync_sub_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_daily_fail_ratio_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  record RECORD;
  fail_threshold numeric := 0.30; -- 30% fail rate threshold
  min_installs integer := 10; -- Minimum installs to avoid false positives
BEGIN
  -- Get apps with high fail ratios from yesterday's data
  -- We use yesterday to ensure we have complete data for the day
  FOR record IN
    WITH daily_stats AS (
      SELECT
        dv.app_id,
        SUM(COALESCE(dv.install, 0)) AS total_installs,
        SUM(COALESCE(dv.fail, 0)) AS total_fails
      FROM public.daily_version dv
      WHERE dv.date = CURRENT_DATE - INTERVAL '1 day'
      GROUP BY dv.app_id
      HAVING SUM(COALESCE(dv.install, 0)) >= min_installs
    ),
    high_fail_apps AS (
      SELECT
        ds.app_id,
        ds.total_installs,
        ds.total_fails,
        -- Cap fail_percentage at 100 to handle edge cases where fails > installs
        CASE
          WHEN ds.total_installs > 0 THEN LEAST(ROUND((ds.total_fails::numeric / ds.total_installs::numeric) * 100, 2), 100)
          ELSE 0
        END AS fail_percentage,
        a.owner_org
      FROM daily_stats ds
      JOIN public.apps a ON a.app_id = ds.app_id
      WHERE ds.total_installs > 0
        AND (ds.total_fails::numeric / ds.total_installs::numeric) >= fail_threshold
    ),
    with_org_email AS (
      SELECT
        hfa.*,
        o.management_email,
        a.name AS app_name
      FROM high_fail_apps hfa
      JOIN public.orgs o ON o.id = hfa.owner_org
      JOIN public.apps a ON a.app_id = hfa.app_id
      WHERE o.management_email IS NOT NULL
        AND o.management_email != ''
    )
    SELECT * FROM with_org_email
  LOOP
    -- Queue email for each app with high fail ratio (with error handling)
    BEGIN
      PERFORM pgmq.send('cron_email',
        jsonb_build_object(
          'function_name', 'cron_email',
          'function_type', 'cloudflare',
          'payload', jsonb_build_object(
            'email', record.management_email,
            'appId', record.app_id,
            'orgId', record.owner_org,
            'type', 'daily_fail_ratio',
            'appName', record.app_name,
            'totalInstalls', record.total_installs,
            'totalFails', record.total_fails,
            'failPercentage', record.fail_percentage,
            'reportDate', (CURRENT_DATE - INTERVAL '1 day')::text
          )
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'process_daily_fail_ratio_email: failed to queue email for app_id %, org_id %, email %: % (%)',
          record.app_id,
          record.owner_org,
          record.management_email,
          SQLERRM,
          SQLSTATE;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_daily_fail_ratio_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_deploy_install_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  record RECORD;
BEGIN
  FOR record IN
    WITH latest AS (
      SELECT DISTINCT ON (dh.app_id, channel_platform)
        dh.id,
        dh.app_id,
        dh.version_id,
        dh.deployed_at,
        dh.owner_org,
        dh.channel_id,
        CASE
          WHEN c.ios = true AND c.android = false THEN 'ios'
          WHEN c.android = true AND c.ios = false THEN 'android'
          ELSE 'all'
        END AS channel_platform
      FROM public.deploy_history dh
      JOIN public.channels c ON c.id = dh.channel_id
      WHERE c.public = true
        AND (c.ios = true OR c.android = true)
      ORDER BY dh.app_id, channel_platform, dh.deployed_at DESC NULLS LAST
    ),
    eligible AS (
      SELECT l.*
      FROM latest l
      WHERE l.deployed_at IS NOT NULL
        AND l.deployed_at <= now() - interval '24 hours'
    ),
    updated AS (
      UPDATE public.deploy_history dh
      SET install_stats_email_sent_at = now()
      FROM eligible e
      WHERE dh.id = e.id
        AND dh.install_stats_email_sent_at IS NULL
      RETURNING dh.id, dh.app_id, dh.version_id, dh.deployed_at, dh.owner_org, dh.channel_id
    ),
    details AS (
      SELECT
        u.id,
        u.app_id,
        u.version_id,
        u.deployed_at,
        u.owner_org,
        u.channel_id,
        e.channel_platform,
        o.management_email,
        c.name AS channel_name,
        v.name AS version_name,
        a.name AS app_name
      FROM updated u
      JOIN eligible e ON e.id = u.id
      JOIN public.orgs o ON o.id = u.owner_org
      JOIN public.channels c ON c.id = u.channel_id
      JOIN public.app_versions v ON v.id = u.version_id
      JOIN public.apps a ON a.app_id = u.app_id
    )
    SELECT
      d.*
    FROM details d
  LOOP
    IF record.management_email IS NULL OR record.management_email = '' THEN
      CONTINUE;
    END IF;

    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', record.management_email,
          'appId', record.app_id,
          'type', 'deploy_install_stats',
          'deployId', record.id,
          'versionId', record.version_id,
          'versionName', record.version_name,
          'channelId', record.channel_id,
          'channelName', record.channel_name,
          'platform', record.channel_platform,
          'appName', record.app_name,
          'deployedAt', record.deployed_at
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_deploy_install_stats_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_failed_uploads"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  failed_version RECORD;
BEGIN
  FOR failed_version IN (
    SELECT * FROM public.get_versions_with_no_metadata()
  )
  LOOP
    PERFORM pgmq.send('cron_clear_versions',
      jsonb_build_object(
        'function_name', 'cron_clear_versions',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object('version', failed_version)
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_failed_uploads"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_free_trial_expired"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.stripe_info
  SET is_good_plan = false
  WHERE status <> 'succeeded' AND trial_at < NOW();
END;
$$;


ALTER FUNCTION "public"."process_free_trial_expired"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer DEFAULT 950) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  queue_name text;
BEGIN
  -- Process each queue in the array with individual exception handling
  FOREACH queue_name IN ARRAY queue_names
  LOOP
    BEGIN
      -- Call the existing single-queue function (fire-and-forget)
      PERFORM public.process_function_queue(queue_name, batch_size);
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but continue processing other queues
      RAISE WARNING 'process_function_queue failed for queue "%": %', queue_name, SQLERRM;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer DEFAULT 950) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed int;
BEGIN
  -- Check if the queue has elements
  EXECUTE format('SELECT count(*) FROM pgmq.q_%I', queue_name) INTO queue_size;

  -- Only make the HTTP request if the queue is not empty
  IF queue_size > 0 THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    -- Calculate how many times to call the sync endpoint (1 call per batch_size items, max 10 calls)
    calls_needed := least(ceil(queue_size / batch_size::float)::int, 10);

    -- Call the endpoint multiple times if needed (fire-and-forget)
    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name, 'batch_size', batch_size),
        timeout_milliseconds := 8000
      );
    END LOOP;
  END IF;
END;
$$;


ALTER FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stats_email_monthly"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$                                                              
DECLARE                                                            
  app_record RECORD;                                               
BEGIN                                                              
  FOR app_record IN (                                              
    SELECT a.app_id, o.management_email                            
    FROM public.apps a                                                    
    JOIN public.orgs o ON a.owner_org = o.id                              
  )                                                                
  LOOP                                                             
    PERFORM pgmq.send('cron_email',                                
      jsonb_build_object(                                          
        'function_name', 'cron_email',                             
        'function_type', 'cloudflare',                             
        'payload', jsonb_build_object(                             
          'email', app_record.management_email,                    
          'appId', app_record.app_id,                              
          'type', 'monthly_create_stats'                           
        )                                                          
      )                                                            
    );                                                             
  END LOOP;
END;                                                               
$$;


ALTER FUNCTION "public"."process_stats_email_monthly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stats_email_weekly"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT a.app_id, o.management_email
    FROM public.apps a
    JOIN public.orgs o ON a.owner_org = o.id
  )
  LOOP
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', app_record.management_email,
          'appId', app_record.app_id,
          'type', 'weekly_install_stats'
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_stats_email_weekly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subscribed_orgs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
    ORDER BY o.id ASC
  )
  LOOP
    PERFORM pgmq.send('cron_plan',
      jsonb_build_object(
        'function_name', 'cron_plan',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_subscribed_orgs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN

  PERFORM pgmq.send('cron_stat_org',
    jsonb_build_object(
      'function_name', 'cron_stat_org',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
      'orgId', org_id,
      'customerId', customer_id
      )
    )
  );
END;
$$;


ALTER FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_app_id" character varying DEFAULT NULL::character varying, "p_channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'Public RBAC permission check for authenticated users. Uses auth.uid() and delegates to rbac_check_permission_direct.';



CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_org_enforcing_2fa boolean;
  v_effective_user_id uuid := p_user_id;
  v_password_policy_ok boolean;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  -- Derive org from app/channel when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF v_effective_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;
  END IF;

  -- Resolve user from API key when needed (handles hashed keys too).
  IF v_effective_user_id IS NULL AND p_apikey IS NOT NULL THEN
    SELECT user_id INTO v_effective_user_id
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Enforce password policy if enabled for the org.
  IF v_effective_org_id IS NOT NULL THEN
    v_password_policy_ok := public.user_meets_password_policy(v_effective_user_id, v_effective_org_id);
    IF v_password_policy_ok = false THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), v_effective_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;
  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      -- Unknown permission in legacy mode, deny by default
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id
      ));
      RETURN false;
    END IF;

    -- Use appropriate legacy check based on context
    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, v_effective_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, v_effective_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, v_effective_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") IS 'Direct RBAC permission check with automatic legacy fallback based on org feature flag. Use this from application code for explicit permission checks.';



CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
  v_org_enforcing_2fa boolean;
  v_effective_user_id uuid := p_user_id;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  -- Derive org from app/channel when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF v_effective_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;
  END IF;

  -- Resolve user from API key when needed (handles hashed keys too).
  IF v_effective_user_id IS NULL AND p_apikey IS NOT NULL THEN
    SELECT user_id INTO v_effective_user_id
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;
  END IF;

  -- Enforce 2FA if the org requires it.
  IF v_effective_org_id IS NOT NULL THEN
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE id = v_effective_org_id;

    IF v_org_enforcing_2fa = true AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id)) THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_2FA_ENFORCEMENT', jsonb_build_object(
        'permission', p_permission_key,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'user_id', v_effective_user_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
      RETURN false;
    END IF;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly
    IF v_effective_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), v_effective_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;
  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      -- Unknown permission in legacy mode, deny by default
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', v_effective_user_id
      ));
      RETURN false;
    END IF;

    -- Use appropriate legacy check based on context
    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, v_effective_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, v_effective_user_id);
    ELSE
      RETURN public.check_min_rights_legacy_no_password_policy(v_legacy_right, v_effective_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_app_id" character varying DEFAULT NULL::character varying, "p_channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct_no_password_policy(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'RBAC permission check without password policy enforcement. Uses auth.uid() and delegates to rbac_check_permission_direct_no_password_policy.';



CREATE OR REPLACE FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_migration_result jsonb;
  v_was_enabled boolean;
BEGIN
  -- Check if already enabled
  SELECT use_new_rbac INTO v_was_enabled FROM public.orgs WHERE id = p_org_id;
  IF v_was_enabled THEN
    RETURN jsonb_build_object(
      'status', 'already_enabled',
      'org_id', p_org_id,
      'message', 'RBAC was already enabled for this org'
    );
  END IF;

  -- Migrate org_users to role_bindings
  v_migration_result := public.rbac_migrate_org_users_to_bindings(p_org_id, p_granted_by);

  -- Enable RBAC flag
  UPDATE public.orgs SET use_new_rbac = true WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'org_id', p_org_id,
    'migration_result', v_migration_result,
    'rbac_enabled', true
  );
END;
$$;


ALTER FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") IS 'Migrates org_users to role_bindings and enables RBAC for an org in one transaction.';



CREATE OR REPLACE FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_channel_app_id text;
  v_channel_org_id uuid;
  v_has boolean := false;
BEGIN
  IF p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve scope identifiers to UUIDs
  IF p_app_id IS NOT NULL THEN
    SELECT id, owner_org INTO v_app_uuid, v_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT rbac_id, app_id, owner_org INTO v_channel_uuid, v_channel_app_id, v_channel_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_uuid IS NOT NULL THEN
      IF v_app_uuid IS NULL THEN
        SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = v_channel_app_id LIMIT 1;
      END IF;
      IF v_org_id IS NULL THEN
        v_org_id := v_channel_org_id;
      END IF;
    END IF;
  END IF;

  WITH RECURSIVE scope_catalog AS (
    SELECT public.rbac_scope_platform()::text AS scope_type, NULL::uuid AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id
    UNION ALL
    SELECT public.rbac_scope_org(), v_org_id, NULL::uuid, NULL::uuid WHERE v_org_id IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_app(), v_org_id, v_app_uuid, NULL::uuid WHERE v_app_uuid IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_channel(), v_org_id, v_app_uuid, v_channel_uuid WHERE v_channel_uuid IS NOT NULL
  ),
  direct_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.role_bindings rb ON rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_platform()) OR
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.channel_id = s.channel_id)
      )
    WHERE rb.principal_type = p_principal_type
      AND rb.principal_id = p_principal_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  group_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.group_members gm ON gm.user_id = p_principal_id
    JOIN public.groups g ON g.id = gm.group_id
    JOIN public.role_bindings rb ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = gm.group_id
    WHERE p_principal_type = public.rbac_principal_user()
      AND rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.channel_id = s.channel_id)
      )
      AND (v_org_id IS NULL OR g.org_id = v_org_id)
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  combined_roles AS (
    SELECT role_id FROM direct_roles
    UNION
    SELECT role_id FROM group_roles
  ),
  role_closure AS (
    SELECT role_id FROM combined_roles
    UNION
    SELECT rh.child_role_id
    FROM public.role_hierarchy rh
    JOIN role_closure rc ON rc.role_id = rh.parent_role_id
  ),
  perm_set AS (
    SELECT DISTINCT p.key
    FROM role_closure rc
    JOIN public.role_permissions rp ON rp.role_id = rc.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
  )
  SELECT EXISTS (SELECT 1 FROM perm_set WHERE key = p_permission_key) INTO v_has;

  RETURN v_has;
END;
$$;


ALTER FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'RBAC permission resolver with scope awareness and role hierarchy expansion.';



CREATE OR REPLACE FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_enabled boolean;
  v_global_enabled boolean;
BEGIN
  SELECT use_new_rbac INTO v_org_enabled FROM public.orgs WHERE id = p_org_id;
  SELECT use_new_rbac INTO v_global_enabled FROM public.rbac_settings WHERE id = 1;

  RETURN COALESCE(v_org_enabled, false) OR COALESCE(v_global_enabled, false);
END;
$$;


ALTER FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") IS 'Feature-flag gate for RBAC. Defaults to false; true when org or global flag is set.';



CREATE OR REPLACE FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  CASE p_role_name
    WHEN public.rbac_role_org_super_admin() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_role_org_admin() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_role_org_billing_admin() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_role_org_member() THEN RETURN public.rbac_right_read();
    ELSE RETURN public.rbac_right_read();
  END CASE;
END;
$$;


ALTER FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") IS '
Maps RBAC org role names to legacy user_min_right values for compatibility with
legacy tables and RLS.
';



CREATE OR REPLACE FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Map permissions to their legacy equivalents
  -- This mapping should match PERMISSION_TO_LEGACY_RIGHT in utils/rbac.ts
  CASE p_permission_key
    -- Read permissions -> public.rbac_right_read()
    WHEN public.rbac_perm_org_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_org_read_members() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_bundles() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_channels() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_logs() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_devices() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read_history() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read_forced_devices() THEN RETURN public.rbac_right_read();

    -- Upload permissions -> public.rbac_right_upload()
    WHEN public.rbac_perm_app_upload_bundle() THEN RETURN public.rbac_right_upload();

    -- Write permissions -> public.rbac_right_write()
    WHEN public.rbac_perm_app_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_create_channel() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_manage_devices() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_build_native() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_promote_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_rollback_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_manage_forced_devices() THEN RETURN public.rbac_right_write();

    -- Admin permissions -> public.rbac_right_admin()
    WHEN public.rbac_perm_org_update_settings() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_invite_user() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_billing() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_invoices() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_bundle_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_read_audit() THEN RETURN public.rbac_right_admin();

    -- Super admin permissions -> public.rbac_right_super_admin()
    WHEN public.rbac_perm_org_update_user_roles() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_org_update_billing() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_org_read_billing_audit() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_org_delete() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_app_transfer() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_impersonate_user() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_orgs_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_apps_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_channels_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_run_maintenance_jobs() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_delete_orphan_users() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_read_all_audit() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_db_break_glass() THEN RETURN public.rbac_right_super_admin();

    ELSE RETURN NULL; -- Unknown permission
  END CASE;
END;
$$;


ALTER FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") IS 'Maps RBAC permission keys to legacy user_min_right values for fallback checks.';



CREATE OR REPLACE FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_channel_id IS NOT NULL THEN
    -- No channel-level role mapping for now
    RETURN NULL;
  ELSIF p_app_id IS NOT NULL THEN
    -- App-level legacy mapping to RBAC roles
    IF p_user_right >= public.rbac_right_admin()::public.user_min_right THEN
      RETURN public.rbac_role_app_admin();
    ELSIF p_user_right = public.rbac_right_write()::public.user_min_right THEN
      RETURN public.rbac_role_app_developer();
    ELSIF p_user_right = public.rbac_right_upload()::public.user_min_right THEN
      RETURN public.rbac_role_app_uploader();
    ELSIF p_user_right = public.rbac_right_read()::public.user_min_right THEN
      RETURN public.rbac_role_app_reader();
    END IF;
    RETURN NULL;
  ELSE
    -- Org-level legacy mapping
    IF p_user_right >= public.rbac_right_super_admin()::public.user_min_right THEN
      RETURN public.rbac_role_org_super_admin();
    ELSIF p_user_right >= public.rbac_right_admin()::public.user_min_right THEN
      RETURN public.rbac_role_org_admin();
    ELSIF p_user_right = public.rbac_right_write()::public.user_min_right THEN
      -- Org-level write creates org_member + app_developer for each app
      RETURN 'org_member + app_developer(per-app)';
    ELSIF p_user_right = public.rbac_right_upload()::public.user_min_right THEN
      -- Org-level upload creates org_member + app_uploader for each app
      RETURN 'org_member + app_uploader(per-app)';
    ELSIF p_user_right = public.rbac_right_read()::public.user_min_right THEN
      -- Org-level read creates org_member + app_reader for each app
      RETURN 'org_member + app_reader(per-app)';
    END IF;
    RETURN NULL;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) IS 'Heuristic mapping from legacy org_users rows to Phase 1 priority roles. For org-level read/upload/write, returns composite string indicating org_member + per-app role pattern used during migration.';



CREATE OR REPLACE FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_granted_by uuid;
  v_org_user RECORD;
  v_app RECORD;
  v_role_name text;
  v_app_role_name text;
  v_role_id uuid;
  v_app_role_id uuid;
  v_scope_type text;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_binding_id uuid;
  v_migrated_count int := 0;
  v_skipped_count int := 0;
  v_error_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_migration_reason text := 'Migrated from org_users (legacy)';
BEGIN
  -- Use provided granted_by or find org owner
  IF p_granted_by IS NULL THEN
    SELECT created_by INTO v_granted_by FROM public.orgs WHERE id = p_org_id LIMIT 1;
    IF v_granted_by IS NULL THEN
      -- Fallback: use first admin user in org
      SELECT user_id INTO v_granted_by
      FROM public.org_users
      WHERE org_id = p_org_id
        AND user_right >= public.rbac_right_admin()::public.user_min_right
        AND app_id IS NULL
        AND channel_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    IF v_granted_by IS NULL THEN
      RAISE EXCEPTION 'Cannot determine granted_by user for org %', p_org_id;
    END IF;
  ELSE
    v_granted_by := p_granted_by;
  END IF;

  -- Iterate through all org_users for this org
  FOR v_org_user IN
    SELECT id, user_id, org_id, app_id, channel_id, user_right
    FROM public.org_users
    WHERE org_id = p_org_id
  LOOP
    BEGIN
      -- Special handling for org-level read/upload/write: create org_member + app-level roles
      IF v_org_user.app_id IS NULL AND v_org_user.channel_id IS NULL
         AND v_org_user.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN

        -- 1) Create org_member binding
        SELECT id INTO v_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;
        IF v_role_id IS NOT NULL THEN
          -- Check if org_member binding already exists
          SELECT id INTO v_binding_id FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_user()
            AND principal_id = v_org_user.user_id
            AND role_id = v_role_id
            AND scope_type = public.rbac_scope_org()
            AND org_id = p_org_id
          LIMIT 1;

          IF v_binding_id IS NULL THEN
            INSERT INTO public.role_bindings (
              principal_type, principal_id, role_id, scope_type, org_id,
              granted_by, granted_at, reason, is_direct
            ) VALUES (
              public.rbac_principal_user(), v_org_user.user_id, v_role_id, public.rbac_scope_org(), p_org_id,
              v_granted_by, now(), v_migration_reason, true
            );
            v_migrated_count := v_migrated_count + 1;
          END IF;
        END IF;

        -- 2) Determine app-level role based on user_right
        IF v_org_user.user_right = public.rbac_right_read() THEN
          v_app_role_name := public.rbac_role_app_reader();
        ELSIF v_org_user.user_right = public.rbac_right_upload() THEN
          v_app_role_name := public.rbac_role_app_uploader();
        ELSIF v_org_user.user_right = public.rbac_right_write() THEN
          v_app_role_name := public.rbac_role_app_developer();
        END IF;

        SELECT id INTO v_app_role_id FROM public.roles WHERE name = v_app_role_name LIMIT 1;
        IF v_app_role_id IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'app_role_not_found',
            'role_name', v_app_role_name
          );
          CONTINUE;
        END IF;

        -- 3) Create app-level binding for EACH app in the org
        FOR v_app IN
          SELECT id, app_id FROM public.apps WHERE owner_org = p_org_id
        LOOP
          -- Check if app binding already exists
          SELECT id INTO v_binding_id FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_user()
            AND principal_id = v_org_user.user_id
            AND role_id = v_app_role_id
            AND scope_type = public.rbac_scope_app()
            AND app_id = v_app.id
          LIMIT 1;

          IF v_binding_id IS NULL THEN
            INSERT INTO public.role_bindings (
              principal_type, principal_id, role_id, scope_type, org_id, app_id,
              granted_by, granted_at, reason, is_direct
            ) VALUES (
              public.rbac_principal_user(), v_org_user.user_id, v_app_role_id, public.rbac_scope_app(), p_org_id, v_app.id,
              v_granted_by, now(), v_migration_reason, true
            );
            v_migrated_count := v_migrated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END LOOP;

        CONTINUE; -- Skip standard processing for this org_user
      END IF;

      -- Standard processing for app/channel-specific rights or admin rights
      v_role_name := public.rbac_legacy_role_hint(
        v_org_user.user_right,
        v_org_user.app_id,
        v_org_user.channel_id
      );

      -- Skip if no suitable role
      IF v_role_name IS NULL THEN
        v_skipped_count := v_skipped_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'org_user_id', v_org_user.id,
          'user_id', v_org_user.user_id,
          'reason', 'no_suitable_role',
          'user_right', v_org_user.user_right::text,
          'app_id', v_org_user.app_id,
          'channel_id', v_org_user.channel_id
        );
        CONTINUE;
      END IF;

      -- Get role ID
      SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name LIMIT 1;
      IF v_role_id IS NULL THEN
        v_error_count := v_error_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'org_user_id', v_org_user.id,
          'user_id', v_org_user.user_id,
          'reason', 'role_not_found',
          'role_name', v_role_name
        );
        CONTINUE;
      END IF;

      -- Determine scope type and resolve IDs
      IF v_org_user.channel_id IS NOT NULL THEN
        v_scope_type := public.rbac_scope_channel();
        SELECT id INTO v_app_uuid FROM public.apps
        WHERE app_id = v_org_user.app_id LIMIT 1;
        SELECT rbac_id INTO v_channel_uuid FROM public.channels
        WHERE id = v_org_user.channel_id LIMIT 1;

        IF v_app_uuid IS NULL OR v_channel_uuid IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'channel_or_app_not_found',
            'app_id', v_org_user.app_id,
            'channel_id', v_org_user.channel_id
          );
          CONTINUE;
        END IF;
      ELSIF v_org_user.app_id IS NOT NULL THEN
        v_scope_type := public.rbac_scope_app();
        SELECT id INTO v_app_uuid FROM public.apps
        WHERE app_id = v_org_user.app_id LIMIT 1;
        v_channel_uuid := NULL;

        IF v_app_uuid IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'app_not_found',
            'app_id', v_org_user.app_id
          );
          CONTINUE;
        END IF;
      ELSE
        v_scope_type := public.rbac_scope_org();
        v_app_uuid := NULL;
        v_channel_uuid := NULL;
      END IF;

      -- Check if binding already exists (idempotency)
      SELECT id INTO v_binding_id FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = v_org_user.user_id
        AND role_id = v_role_id
        AND scope_type = v_scope_type
        AND org_id = p_org_id
        AND (app_id = v_app_uuid OR (app_id IS NULL AND v_app_uuid IS NULL))
        AND (channel_id = v_channel_uuid OR (channel_id IS NULL AND v_channel_uuid IS NULL))
      LIMIT 1;

      IF v_binding_id IS NOT NULL THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      -- Create role binding
      INSERT INTO public.role_bindings (
        principal_type,
        principal_id,
        role_id,
        scope_type,
        org_id,
        app_id,
        channel_id,
        granted_by,
        granted_at,
        reason,
        is_direct
      ) VALUES (
        public.rbac_principal_user(),
        v_org_user.user_id,
        v_role_id,
        v_scope_type,
        p_org_id,
        v_app_uuid,
        v_channel_uuid,
        v_granted_by,
        now(),
        v_migration_reason,
        true
      );

      v_migrated_count := v_migrated_count + 1;

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'org_user_id', v_org_user.id,
        'user_id', v_org_user.user_id,
        'reason', 'exception',
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'granted_by', v_granted_by,
    'migrated_count', v_migrated_count,
    'skipped_count', v_skipped_count,
    'error_count', v_error_count,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") IS 'Migrates org_users records to role_bindings for a specific org. Idempotent and returns migration report.';



CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_build_native"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.build_native'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_build_native"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_create_channel"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.create_channel'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_create_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_manage_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.manage_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_manage_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_bundles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_bundles'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_bundles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_channels"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_channels'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_channels"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_logs"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_logs'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_transfer"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.transfer'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_transfer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_update_user_roles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.update_user_roles'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_update_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_upload_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.upload_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_upload_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_update"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.update'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.manage_forced_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_promote_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.promote_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_promote_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_forced_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_forced_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_forced_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_history"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_history'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_rollback_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.rollback_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_rollback_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_invite_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.invite_user'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_invite_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_billing"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_billing'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_billing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_billing_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_billing_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_billing_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_invoices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_invoices'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_invoices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_members"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_members'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_billing"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_billing'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_billing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_user_roles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_user_roles'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_db_break_glass"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.db_break_glass'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_db_break_glass"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.delete_orphan_users'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_impersonate_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.impersonate_user'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_impersonate_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_apps_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_apps_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_apps_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_channels_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_channels_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_channels_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_orgs_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_read_all_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.read_all_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_read_all_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.run_maintenance_jobs'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_scope = public.rbac_scope_org() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin()) THEN
      RETURN public.rbac_perm_org_update_user_roles();
    ELSIF p_min_right IN (public.rbac_right_write(), public.rbac_right_upload(), public.rbac_right_invite_write(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_org_update_settings();
    ELSE
      RETURN public.rbac_perm_org_read();
    END IF;
  ELSIF p_scope = public.rbac_scope_app() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin(), public.rbac_right_write(), public.rbac_right_invite_write()) THEN
      RETURN public.rbac_perm_app_update_settings();
    ELSIF p_min_right IN (public.rbac_right_upload(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_app_upload_bundle();
    ELSE
      RETURN public.rbac_perm_app_read();
    END IF;
  ELSIF p_scope = public.rbac_scope_channel() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin(), public.rbac_right_write(), public.rbac_right_invite_write()) THEN
      RETURN public.rbac_perm_channel_update_settings();
    ELSIF p_min_right IN (public.rbac_right_upload(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_channel_promote_bundle();
    ELSE
      RETURN public.rbac_perm_channel_read();
    END IF;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") IS 'Compatibility mapping from legacy min_right + scope to a single RBAC permission key (documented assumptions).';



CREATE OR REPLACE FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") RETURNS TABLE("org_user_id" bigint, "user_id" "uuid", "user_right" "text", "app_id" character varying, "channel_id" bigint, "suggested_role" "text", "scope_type" "text", "will_migrate" boolean, "skip_reason" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ou.id AS org_user_id,
    ou.user_id,
    ou.user_right::text AS user_right,
    ou.app_id,
    ou.channel_id,
    public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) AS suggested_role,
    CASE
      WHEN ou.channel_id IS NOT NULL THEN public.rbac_scope_channel()
      WHEN ou.app_id IS NOT NULL THEN public.rbac_scope_app()
      ELSE public.rbac_scope_org()
    END AS scope_type,
    public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) IS NOT NULL AS will_migrate,
    CASE
      WHEN public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) IS NULL THEN 'no_suitable_role'
      ELSE NULL
    END AS skip_reason
  FROM public.org_users ou
  WHERE ou.org_id = p_org_id
  ORDER BY ou.user_id, ou.app_id NULLS FIRST, ou.channel_id NULLS FIRST;
END;
$$;


ALTER FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") IS 'Preview what would be migrated for an org without making changes.';



CREATE OR REPLACE FUNCTION "public"."rbac_principal_apikey"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'apikey'::text $$;


ALTER FUNCTION "public"."rbac_principal_apikey"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_principal_group"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'group'::text $$;


ALTER FUNCTION "public"."rbac_principal_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_principal_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'user'::text $$;


ALTER FUNCTION "public"."rbac_principal_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_admin"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'admin'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_invite_admin"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'invite_admin'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_invite_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_invite_super_admin"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'invite_super_admin'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_invite_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_invite_upload"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'invite_upload'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_invite_upload"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_invite_write"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'invite_write'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_invite_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_read"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'read'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_super_admin"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'super_admin'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_upload"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'upload'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_upload"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_right_write"() RETURNS "public"."user_min_right"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'write'::public.user_min_right $$;


ALTER FUNCTION "public"."rbac_right_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_app_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_developer"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_developer'::text $$;


ALTER FUNCTION "public"."rbac_role_app_developer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_app_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_uploader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_uploader'::text $$;


ALTER FUNCTION "public"."rbac_role_app_uploader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_bundle_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_bundle_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_bundle_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_bundle_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_channel_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_channel_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_channel_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_channel_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_billing_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_billing_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_billing_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_member"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_member'::text $$;


ALTER FUNCTION "public"."rbac_role_org_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_super_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_super_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_platform_super_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform_super_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_platform_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_deleted_count int;
  v_migration_reason text := 'Migrated from org_users (legacy)';
BEGIN
  -- Delete all role_bindings that were migrated from org_users
  DELETE FROM public.role_bindings
  WHERE org_id = p_org_id
    AND reason = v_migration_reason
    AND is_direct = true;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Disable RBAC flag
  UPDATE public.orgs SET use_new_rbac = false WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'org_id', p_org_id,
    'deleted_bindings', v_deleted_count,
    'rbac_enabled', false
  );
END;
$$;


ALTER FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") IS 'Removes migrated role_bindings and disables RBAC for an org (rollback migration).';



CREATE OR REPLACE FUNCTION "public"."rbac_scope_app"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app'::text $$;


ALTER FUNCTION "public"."rbac_scope_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle'::text $$;


ALTER FUNCTION "public"."rbac_scope_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_channel"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel'::text $$;


ALTER FUNCTION "public"."rbac_scope_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_org"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org'::text $$;


ALTER FUNCTION "public"."rbac_scope_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_platform"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform'::text $$;


ALTER FUNCTION "public"."rbac_scope_platform"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" timestamp without time zone, "bandwidth" numeric, "app_id" character varying)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(file_size) AS bandwidth,
    bandwidth_usage.app_id
  FROM public.bandwidth_usage
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND bandwidth_usage. app_id = p_app_id
  GROUP BY bandwidth_usage.app_id, date
  ORDER BY date;
END;
$$;


ALTER FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "date", "mau" bigint, "app_id" character varying)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    first_seen.date AS date,
    COUNT(*)::bigint AS mau,
    p_app_id AS app_id
  FROM (
    SELECT
      MIN(DATE_TRUNC('day', device_usage.timestamp)::date) AS date,
      device_usage.device_id
    FROM public.device_usage
    WHERE
      device_usage.app_id = p_app_id
      AND device_usage.timestamp >= p_period_start
      AND device_usage.timestamp < p_period_end
    GROUP BY device_usage.device_id
  ) AS first_seen
  GROUP BY first_seen.date
  ORDER BY first_seen.date;
END;
$$;


ALTER FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "date" "date", "storage" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_app_id AS app_id,
    DATE_TRUNC('day', timestamp)::DATE AS date,
    SUM(size)::BIGINT AS storage
  FROM public.version_meta
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND version_meta.app_id = p_app_id
  GROUP BY version_meta.app_id, date
  ORDER BY date;
END;
$$;


ALTER FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "version_name" character varying, "date" timestamp without time zone, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    vu.app_id,
    -- Use version_name if available (new data), otherwise look up from app_versions (old data)
    COALESCE(vu.version_name, av.name)::character varying as version_name,
    DATE_TRUNC('day', vu.timestamp) AS date,
    SUM(CASE WHEN vu.action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN vu.action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN vu.action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN vu.action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage vu
  LEFT JOIN public.app_versions av ON vu.version_id = av.id AND vu.version_name IS NULL
  WHERE
    vu.app_id = p_app_id
    AND vu.timestamp >= p_period_start
    AND vu.timestamp < p_period_end
  GROUP BY date, vu.app_id, COALESCE(vu.version_name, av.name)
  ORDER BY date;
END;
$$;


ALTER FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
BEGIN
  IF p_build_time_unit < 0 THEN RAISE EXCEPTION 'Build time cannot be negative'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform: %', p_platform; END IF;

  -- Apply platform multiplier
  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_unit * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_unit, billable_seconds)
  VALUES (p_org_id, p_user_id, p_build_id, p_platform, p_build_time_unit, v_billable_seconds)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_unit = EXCLUDED.build_time_unit,
    billable_seconds = EXCLUDED.billable_seconds
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;


ALTER FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_deployment_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- If version is changing, record the deployment
    IF OLD.version <> NEW.version THEN
        -- Insert new record
        INSERT INTO public.deploy_history (
            channel_id, 
            app_id, 
            version_id, 
            owner_org,
            created_by
        )
        VALUES (
            NEW.id,
            NEW.app_id,
            NEW.version,
            NEW.owner_org,
            coalesce(public.get_identity()::uuid, NEW.created_by)
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_deployment_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_enforcing_2fa boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = reject_access_due_to_2fa.org_id) THEN
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_2fa.org_id;

    -- 7.1 If a given org does not enable 2FA enforcement, return false
    IF org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- 7.2 If a given org REQUIRES 2FA, and has_2fa_enabled(user_id) == false, return true
    IF org_enforcing_2fa = true AND NOT public.has_2fa_enabled(reject_access_due_to_2fa.user_id) THEN
        PERFORM public.pg_log('deny: REJECT_ACCESS_DUE_TO_2FA', jsonb_build_object('org_id', org_id, 'user_id', user_id));
        RETURN true;
    END IF;

    -- 7.3 Otherwise, return false
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_owner_org uuid;
    v_user_id uuid;
    v_org_enforcing_2fa boolean;
BEGIN
    -- Get the owner organization for this app
    SELECT owner_org INTO v_owner_org
    FROM public.apps
    WHERE public.apps.app_id = reject_access_due_to_2fa_for_app.app_id;

    -- If app not found or no owner_org, allow (no 2FA enforcement can apply)
    IF v_owner_org IS NULL THEN
        RETURN false;
    END IF;

    -- Get the current user identity (works for both JWT auth and API key)
    -- Use get_identity_org_appid to ensure org/app scoping is respected
    v_user_id := public.get_identity_org_appid('{read,upload,write,all}'::public.key_mode[], v_owner_org, reject_access_due_to_2fa_for_app.app_id);

    -- If no user identity found, allow (auth failure should be handled elsewhere)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = v_owner_org;

    -- If org not found, allow (no 2FA enforcement can apply)
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN false;
    END IF;

    -- If org does not enforce 2FA, allow access
    IF v_org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- If org enforces 2FA and user doesn't have 2FA enabled, reject access
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(v_user_id) THEN
        RETURN true;
    END IF;

    -- Otherwise, allow access
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_user_id uuid;
    v_org_enforcing_2fa boolean;
BEGIN
    -- Get the current user identity (works for both JWT auth and API key)
    -- NOTE: We use get_identity_org_allowed (not get_identity like the app version) because
    -- this function takes an org_id directly, so we must validate that the API key
    -- has access to this specific org before checking 2FA compliance.
    -- This prevents org-limited API keys from bypassing org access restrictions.
    v_user_id := public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], reject_access_due_to_2fa_for_org.org_id);

    -- If no user identity found, reject access
    IF v_user_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_2fa_for_org.org_id;

    -- If org not found, allow access (no 2FA enforcement can apply to a non-existent org)
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN false;
    END IF;

    -- If org does not enforce 2FA, allow access
    IF v_org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- If org enforces 2FA and user doesn't have 2FA enabled, reject access
    -- Use has_2fa_enabled(user_id) to check the specific user (works for API key auth)
    IF v_org_enforcing_2fa = true AND NOT public.has_2fa_enabled(v_user_id) THEN
        RETURN true;
    END IF;

    -- Otherwise, allow access
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_has_policy boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = reject_access_due_to_password_policy.org_id) THEN
        RETURN false;
    END IF;

    -- Check if org has password policy enabled
    SELECT
        password_policy_config IS NOT NULL
        AND (password_policy_config->>'enabled')::boolean = true
    INTO org_has_policy
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_password_policy.org_id;

    -- If no policy enabled, don't reject
    IF NOT COALESCE(org_has_policy, false) THEN
        RETURN false;
    END IF;

    -- If org requires policy and user doesn't meet it, reject access
    IF NOT public.user_meets_password_policy(user_id, org_id) THEN
        PERFORM public.pg_log('deny: REJECT_ACCESS_DUE_TO_PASSWORD_POLICY', jsonb_build_object('org_id', org_id, 'user_id', user_id));
        RETURN true;
    END IF;

    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_old_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < NOW() - interval '1 day';
END;
$$;


ALTER FUNCTION "public"."remove_old_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE tmp_user record;
BEGIN
  PERFORM 1 FROM public.orgs WHERE public.orgs.id = rescind_invitation.org_id; IF NOT FOUND THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = rescind_invitation.email AND public.tmp_users.org_id = rescind_invitation.org_id;
  IF NOT FOUND THEN RETURN 'NO_INVITATION'; END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN RETURN 'ALREADY_CANCELLED'; END IF;
  UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_apps_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."icon_url" := public.strip_html(NEW."icon_url");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_apps_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_orgs_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."management_email" := public.strip_html(NEW."management_email");
  NEW."logo" := public.strip_html(NEW."logo");
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_orgs_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_tmp_users_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_tmp_users_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_users_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  NEW."country" := public.strip_html(NEW."country");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_users_text_fields"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_metrics_cache" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "response" "jsonb" NOT NULL,
    "cached_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_metrics_cache" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "public"."app_metrics_cache"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    metrics_json jsonb;
    cache_record public.app_metrics_cache%ROWTYPE;
BEGIN
    WITH DateSeries AS (
        SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
    ),
    all_apps AS (
        SELECT apps.app_id, apps.owner_org
        FROM public.apps
        WHERE apps.owner_org = p_org_id
        UNION
        SELECT deleted_apps.app_id, deleted_apps.owner_org
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
    ),
    deleted_metrics AS (
        SELECT
            deleted_apps.app_id,
            deleted_apps.deleted_at::date AS date,
            COUNT(*) AS deleted_count
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
        AND deleted_apps.deleted_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY deleted_apps.app_id, deleted_apps.deleted_at::date
    ),
    metrics AS (
        SELECT
            aa.app_id,
            ds.date::date,
            COALESCE(dm.mau, 0) AS mau,
            COALESCE(dst.storage, 0) AS storage,
            COALESCE(db.bandwidth, 0) AS bandwidth,
            COALESCE(dbt.build_time_unit, 0) AS build_time_unit,
            COALESCE(SUM(dv.get)::bigint, 0) AS get,
            COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
            COALESCE(SUM(dv.install)::bigint, 0) AS install,
            COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
        FROM
            all_apps aa
        CROSS JOIN
            DateSeries ds
        LEFT JOIN
            public.daily_mau dm ON aa.app_id = dm.app_id AND ds.date = dm.date
        LEFT JOIN
            public.daily_storage dst ON aa.app_id = dst.app_id AND ds.date = dst.date
        LEFT JOIN
            public.daily_bandwidth db ON aa.app_id = db.app_id AND ds.date = db.date
        LEFT JOIN
            public.daily_build_time dbt ON aa.app_id = dbt.app_id AND ds.date = dbt.date
        LEFT JOIN
            public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
        LEFT JOIN
            deleted_metrics del ON aa.app_id = del.app_id AND ds.date = del.date
        GROUP BY
            aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, dbt.build_time_unit, del.deleted_count
    )
    SELECT COALESCE(
        jsonb_agg(row_to_json(metrics) ORDER BY metrics.app_id, metrics.date),
        '[]'::jsonb
    )
    INTO metrics_json
    FROM metrics;

    INSERT INTO public.app_metrics_cache (org_id, start_date, end_date, response, cached_at)
    VALUES (p_org_id, p_start_date, p_end_date, metrics_json, clock_timestamp())
    ON CONFLICT (org_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            response = EXCLUDED.response,
            cached_at = EXCLUDED.cached_at
    RETURNING * INTO cache_record;

    RETURN cache_record;
END;
$$;


ALTER FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.stripe_info
    SET bandwidth_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = org_id);
END;
$$;


ALTER FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.stripe_info SET build_time_exceeded = disabled
  WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = set_build_time_exceeded_by_org.org_id);
END;
$$;


ALTER FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_deleted_at_on_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only set deleted_at when deleted changes from false to true
  -- and deleted_at is not already set (allows manual override if needed)
  IF NEW.deleted = true AND (OLD.deleted = false OR OLD.deleted IS NULL) AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_deleted_at_on_soft_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.stripe_info
    SET mau_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = org_id);
END;
$$;


ALTER FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.stripe_info
    SET storage_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = set_storage_exceeded_by_org.org_id);
END;
$$;


ALTER FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strip_html"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT CASE
    WHEN input IS NULL THEN NULL
    ELSE btrim(regexp_replace(input, '<[^>]*>', '', 'g'))
  END;
$$;


ALTER FUNCTION "public"."strip_html"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_org_user_role_binding_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  old_org_role_name text;
  new_org_role_name text;
  old_org_role_id uuid;
  new_org_role_id uuid;
  old_app_role_name text;
  new_app_role_name text;
  old_app_role_id uuid;
  new_app_role_id uuid;
  org_member_role_id uuid;
  v_app RECORD;
  v_granted_by uuid;
  v_update_reason text := 'Updated from org_users';
  v_use_rbac boolean;
BEGIN
  SELECT use_new_rbac INTO v_use_rbac FROM public.orgs WHERE id = NEW.org_id;
  IF v_use_rbac AND (NEW.rbac_role_name IS NOT NULL OR OLD.rbac_role_name IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Only process if user_right actually changed
  IF OLD.user_right = NEW.user_right THEN
    RETURN NEW;
  END IF;

  -- Only handle org-level rights (no app_id, no channel_id)
  IF NEW.app_id IS NOT NULL OR NEW.channel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_granted_by := COALESCE(auth.uid(), NEW.user_id);

  -- Map old user_right to role names
  CASE OLD.user_right
    WHEN public.rbac_right_super_admin() THEN
      old_org_role_name := public.rbac_role_org_super_admin();
      old_app_role_name := NULL;
    WHEN public.rbac_right_admin() THEN
      old_org_role_name := public.rbac_role_org_admin();
      old_app_role_name := NULL;
    WHEN public.rbac_right_write() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_developer();
    WHEN public.rbac_right_upload() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_uploader();
    WHEN public.rbac_right_read() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_reader();
    WHEN 'invite_super_admin'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_admin'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_write'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_upload'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_read'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    ELSE
      RAISE WARNING 'Unexpected OLD.user_right value: %, skipping role binding sync', OLD.user_right;
      RETURN NEW;
  END CASE;

  -- Map new user_right to role names
  CASE NEW.user_right
    WHEN public.rbac_right_super_admin() THEN
      new_org_role_name := public.rbac_role_org_super_admin();
      new_app_role_name := NULL;
    WHEN public.rbac_right_admin() THEN
      new_org_role_name := public.rbac_role_org_admin();
      new_app_role_name := NULL;
    WHEN public.rbac_right_write() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_developer();
    WHEN public.rbac_right_upload() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_uploader();
    WHEN public.rbac_right_read() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_reader();
    WHEN 'invite_super_admin'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_admin'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_write'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_upload'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_read'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    ELSE
      RAISE WARNING 'Unexpected NEW.user_right value: %, skipping role binding sync', NEW.user_right;
      RETURN NEW;
  END CASE;

  -- Get role IDs
  IF old_org_role_name IS NOT NULL THEN
    SELECT id INTO old_org_role_id FROM public.roles WHERE name = old_org_role_name LIMIT 1;
  END IF;

  IF new_org_role_name IS NOT NULL THEN
    SELECT id INTO new_org_role_id FROM public.roles WHERE name = new_org_role_name LIMIT 1;
  END IF;
  SELECT id INTO org_member_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;

  IF old_app_role_name IS NOT NULL THEN
    SELECT id INTO old_app_role_id FROM public.roles WHERE name = old_app_role_name LIMIT 1;
  END IF;

  IF new_app_role_name IS NOT NULL THEN
    SELECT id INTO new_app_role_id FROM public.roles WHERE name = new_app_role_name LIMIT 1;
  END IF;

  -- Delete old org-level binding (only if there was a role)
  IF old_org_role_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_org()
      AND org_id = NEW.org_id
      AND role_id = old_org_role_id;
  END IF;

  -- Delete old app-level bindings (for read/upload/write users)
  IF old_app_role_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_app()
      AND org_id = NEW.org_id
      AND role_id = old_app_role_id;
  END IF;

  -- Create new org-level binding
  IF new_org_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type, principal_id, role_id, scope_type, org_id,
      granted_by, granted_at, reason, is_direct
    ) VALUES (
      public.rbac_principal_user(), NEW.user_id, new_org_role_id, public.rbac_scope_org(), NEW.org_id,
      v_granted_by, now(), v_update_reason, true
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Create new app-level bindings for each app (for read/upload/write users)
  IF new_app_role_id IS NOT NULL THEN
    FOR v_app IN SELECT id FROM public.apps WHERE owner_org = NEW.org_id
    LOOP
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, new_app_role_id, public.rbac_scope_app(), NEW.org_id, v_app.id,
        v_granted_by, now(), v_update_reason, true
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Handle transition from admin/super_admin to read/upload/write:
  IF OLD.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin())
    AND NEW.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN
    NULL;
  END IF;

  -- Handle transition from read/upload/write to admin/super_admin:
  IF OLD.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write())
    AND NEW.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) THEN
    IF org_member_role_id IS NOT NULL THEN
      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = NEW.user_id
        AND scope_type = public.rbac_scope_org()
        AND org_id = NEW.org_id
        AND role_id = org_member_role_id;
    END IF;

    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_app()
      AND org_id = NEW.org_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_org_user_role_binding_on_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_org_user_role_binding_on_update"() IS 'Automatically updates role_bindings entries when org_users.user_right is modified, ensuring both systems stay in sync. Handles transitions between admin roles and member roles.';



CREATE OR REPLACE FUNCTION "public"."sync_org_user_to_role_binding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  role_name_to_bind text;
  role_id_to_bind uuid;
  org_member_role_id uuid;
  app_role_name text;
  app_role_id uuid;
  v_app RECORD;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_granted_by uuid;
  v_sync_reason text := 'Synced from org_users';
  v_use_rbac boolean;
BEGIN
  SELECT use_new_rbac INTO v_use_rbac FROM public.orgs WHERE id = NEW.org_id;
  IF v_use_rbac AND NEW.rbac_role_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_granted_by := COALESCE(auth.uid(), NEW.user_id);

  -- Handle org-level rights (no app_id, no channel_id)
  IF NEW.app_id IS NULL AND NEW.channel_id IS NULL THEN
    -- For super_admin and admin: create org-level binding directly
    IF NEW.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) THEN
      CASE NEW.user_right
        WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_org_super_admin();
        WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_org_admin();
      END CASE;

      SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;

      IF role_id_to_bind IS NOT NULL THEN
        INSERT INTO public.role_bindings (
          principal_type, principal_id, role_id, scope_type, org_id,
          granted_by, granted_at, reason, is_direct
        ) VALUES (
          public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_org(), NEW.org_id,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;

    -- For read/upload/write at org level: create org_member + app-level roles for each app
    ELSIF NEW.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN
      -- 1) Create org_member binding at org level
      SELECT id INTO org_member_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;
      IF org_member_role_id IS NOT NULL THEN
        INSERT INTO public.role_bindings (
          principal_type, principal_id, role_id, scope_type, org_id,
          granted_by, granted_at, reason, is_direct
        ) VALUES (
          public.rbac_principal_user(), NEW.user_id, org_member_role_id, public.rbac_scope_org(), NEW.org_id,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;

      -- 2) Determine app-level role based on user_right
      CASE NEW.user_right
        WHEN public.rbac_right_read() THEN app_role_name := public.rbac_role_app_reader();
        WHEN public.rbac_right_upload() THEN app_role_name := public.rbac_role_app_uploader();
        WHEN public.rbac_right_write() THEN app_role_name := public.rbac_role_app_developer();
      END CASE;

      SELECT id INTO app_role_id FROM public.roles WHERE name = app_role_name LIMIT 1;

      -- 3) Create app-level binding for EACH app in the org
      IF app_role_id IS NOT NULL THEN
        FOR v_app IN SELECT id FROM public.apps WHERE owner_org = NEW.org_id
        LOOP
          INSERT INTO public.role_bindings (
            principal_type, principal_id, role_id, scope_type, org_id, app_id,
            granted_by, granted_at, reason, is_direct
          ) VALUES (
            public.rbac_principal_user(), NEW.user_id, app_role_id, public.rbac_scope_app(), NEW.org_id, v_app.id,
            v_granted_by, now(), v_sync_reason, true
          ) ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END IF;

  -- Handle app-level rights (has app_id, no channel_id)
  ELSIF NEW.app_id IS NOT NULL AND NEW.channel_id IS NULL THEN
    CASE NEW.user_right
      WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_app_admin();
      WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_app_admin();
      WHEN public.rbac_right_write() THEN role_name_to_bind := public.rbac_role_app_developer();
      WHEN public.rbac_right_upload() THEN role_name_to_bind := public.rbac_role_app_uploader();
      WHEN public.rbac_right_read() THEN role_name_to_bind := public.rbac_role_app_reader();
      ELSE role_name_to_bind := public.rbac_role_app_reader();
    END CASE;

    SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;
    SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = NEW.app_id LIMIT 1;

    IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL THEN
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_app(), NEW.org_id, v_app_uuid,
        v_granted_by, now(), v_sync_reason, true
      ) ON CONFLICT DO NOTHING;
    END IF;

  -- Handle channel-level rights (has app_id and channel_id)
  ELSIF NEW.app_id IS NOT NULL AND NEW.channel_id IS NOT NULL THEN
    CASE NEW.user_right
      WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_channel_admin();
      WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_channel_admin();
      WHEN public.rbac_right_write() THEN role_name_to_bind := 'channel_developer';
      WHEN public.rbac_right_upload() THEN role_name_to_bind := 'channel_uploader';
      WHEN public.rbac_right_read() THEN role_name_to_bind := public.rbac_role_channel_reader();
      ELSE role_name_to_bind := public.rbac_role_channel_reader();
    END CASE;

    SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;
    SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = NEW.app_id LIMIT 1;
    SELECT rbac_id INTO v_channel_uuid FROM public.channels WHERE id = NEW.channel_id LIMIT 1;

    IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL AND v_channel_uuid IS NOT NULL THEN
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id, channel_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_channel(), NEW.org_id, v_app_uuid, v_channel_uuid,
        v_granted_by, now(), v_sync_reason, true
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_org_user_to_role_binding"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_org_user_to_role_binding"() IS 'Automatically creates/updates role_bindings entries when org_users entries are inserted, ensuring both systems stay in sync. For org-level read/upload/write rights, creates org_member + app-level roles for each app.';



CREATE OR REPLACE FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_source" "text" DEFAULT 'manual'::"text", "p_source_ref" "jsonb" DEFAULT NULL::"jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS TABLE("grant_id" "uuid", "transaction_id" bigint, "available_credits" numeric, "total_credits" numeric, "next_expiration" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  c_empty CONSTANT text := '';
  c_service_role CONSTANT text := 'service_role';
  c_default_source CONSTANT text := 'manual';
  c_purchase CONSTANT public.credit_transaction_type := 'purchase'::public.credit_transaction_type;
  c_session_id_key CONSTANT text := 'sessionId';
  c_payment_intent_key CONSTANT text := 'paymentIntentId';
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_expires timestamptz := COALESCE(p_expires_at, now() + interval '1 year');
  v_source_ref jsonb := p_source_ref;
  v_session_id text := NULLIF(v_source_ref ->> c_session_id_key, c_empty);
  v_payment_intent_id text := NULLIF(v_source_ref ->> c_payment_intent_key, c_empty);
  v_grant_id uuid;
  v_transaction_id bigint;
  v_available numeric := 0;
  v_total numeric := 0;
  v_next_expiration timestamptz;
  v_existing_transaction_id bigint;
  v_existing_grant_id uuid;
BEGIN
  IF current_user <> 'postgres' AND COALESCE(v_request_role, c_empty) <> c_service_role THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Guard the grant/transaction creation inside a subtransaction so we can detect
  -- race-condition duplicates via the new unique indexes and return the existing
  -- ledger row instead of creating another grant.
  BEGIN
    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      p_org_id,
      p_amount,
      0,
      now(),
      v_effective_expires,
      COALESCE(NULLIF(p_source, c_empty), c_default_source),
      v_source_ref,
      p_notes
    )
    RETURNING id INTO v_grant_id;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      description,
      source_ref
    )
    VALUES (
      p_org_id,
      v_grant_id,
      c_purchase,
      p_amount,
      v_available,
      p_notes,
      v_source_ref
    )
    RETURNING id INTO v_transaction_id;

  EXCEPTION WHEN unique_violation THEN
    IF v_session_id IS NULL AND v_payment_intent_id IS NULL THEN
      RAISE;
    END IF;

    SELECT t.id, t.grant_id
    INTO v_existing_transaction_id, v_existing_grant_id
    FROM public.usage_credit_transactions AS t
    WHERE t.org_id = p_org_id
      AND t.transaction_type = c_purchase
      AND (
        (v_session_id IS NOT NULL AND t.source_ref ->> c_session_id_key = v_session_id)
        OR (v_payment_intent_id IS NOT NULL AND t.source_ref ->> c_payment_intent_key = v_payment_intent_id)
      )
    ORDER BY t.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    v_grant_id := v_existing_grant_id;
    v_transaction_id := v_existing_transaction_id;
  END;

  grant_id := v_grant_id;
  transaction_id := v_transaction_id;
  available_credits := v_available;
  total_credits := v_total;
  next_expiration := v_next_expiration;

  RETURN NEXT;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") IS 'Grants credits to an organization, records the transaction ledger entry, and returns the updated balances.';



CREATE OR REPLACE FUNCTION "public"."total_bundle_storage_bytes"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT (
    -- Sum of bundle sizes from app_versions_meta
    COALESCE(
      (SELECT SUM(size) FROM public.app_versions_meta),
      0
    ) +
    -- Sum of manifest file sizes for non-deleted versions
    COALESCE(
      (SELECT SUM(m.file_size)
       FROM public.manifest m
       WHERE EXISTS (
         SELECT 1
         FROM public.app_versions av
         WHERE av.id = m.app_version_id
         AND av.deleted = false
       )),
      0
    )
  )::bigint;
$$;


ALTER FUNCTION "public"."total_bundle_storage_bytes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."total_bundle_storage_bytes"() IS 'Returns total storage in bytes including both bundle sizes (app_versions_meta.size) and manifest file sizes';



CREATE OR REPLACE FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), v_old_org_id, p_app_id, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_OLD_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the source organization)';
  END IF;

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), p_new_org_id, NULL::character varying, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_NEW_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the destination organization)';
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  UPDATE public.apps
  SET
      owner_org = p_new_org_id,
      updated_at = now(),
      transfer_history = COALESCE(transfer_history, '{}') || jsonb_build_object(
          'transferred_at', now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )::jsonb
  WHERE app_id = p_app_id;

  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

END;
$$;


ALTER FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") IS 'Transfers an app and all its related data to a new organization. Requires app.transfer permission on both source and destination organizations.';



CREATE OR REPLACE FUNCTION "public"."transform_role_to_invite"("role_input" "public"."user_min_right") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  CASE role_input
    WHEN 'read'::public.user_min_right THEN RETURN 'invite_read'::public.user_min_right;
    WHEN 'upload'::public.user_min_right THEN RETURN 'invite_upload'::public.user_min_right;
    WHEN 'write'::public.user_min_right THEN RETURN 'invite_write'::public.user_min_right;
    WHEN 'admin'::public.user_min_right THEN RETURN 'invite_admin'::public.user_min_right;
    WHEN 'super_admin'::public.user_min_right THEN RETURN 'invite_super_admin'::public.user_min_right;
    ELSE RETURN role_input; -- If it's already an invite role or unrecognized, return as is
  END CASE;
END;
$$;


ALTER FUNCTION "public"."transform_role_to_invite"("role_input" "public"."user_min_right") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transform_role_to_non_invite"("role_input" "public"."user_min_right") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  CASE role_input
    WHEN 'invite_read'::public.user_min_right THEN RETURN 'read'::public.user_min_right;
    WHEN 'invite_upload'::public.user_min_right THEN RETURN 'upload'::public.user_min_right;
    WHEN 'invite_write'::public.user_min_right THEN RETURN 'write'::public.user_min_right;
    WHEN 'invite_admin'::public.user_min_right THEN RETURN 'admin'::public.user_min_right;
    WHEN 'invite_super_admin'::public.user_min_right THEN RETURN 'super_admin'::public.user_min_right;
    ELSE RETURN role_input; -- If it's already a non-invite role or unrecognized, return as is
  END CASE;
END;
$$;


ALTER FUNCTION "public"."transform_role_to_non_invite"("role_input" "public"."user_min_right") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the base payload
  payload := jsonb_build_object(
    'function_name', TG_ARGV[0],
    'function_type', TG_ARGV[1],
    'payload', jsonb_build_object(
      'old_record', OLD, 
      'record', NEW, 
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  -- Also send to function-specific queue
  IF TG_ARGV[0] IS NOT NULL THEN
    PERFORM pgmq.send(TG_ARGV[0], payload);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_http_queue_post_to_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_webhook_on_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Queue the audit log event for webhook dispatch
  PERFORM pgmq.send(
    'webhook_dispatcher',
    jsonb_build_object(
      'function_name', 'webhook_dispatcher',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
        'audit_log_id', NEW.id,
        'table_name', NEW.table_name,
        'operation', NEW.operation,
        'org_id', NEW.org_id,
        'record_id', NEW.record_id,
        'old_record', NEW.old_record,
        'new_record', NEW.new_record,
        'changed_fields', NEW.changed_fields,
        'user_id', NEW.user_id,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_webhook_on_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.app_versions
    SET deleted = true
    WHERE app_versions.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) < 63113904
      AND app_versions.created_at < (
          SELECT NOW() - make_interval(secs => apps.retention)
          FROM public.apps
          WHERE apps.app_id = app_versions.app_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.channels
          WHERE channels.app_id = app_versions.app_id
            AND channels.version = app_versions.id
      );
END;
$$;


ALTER FUNCTION "public"."update_app_versions_retention"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  role_id uuid;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
  api_key_text text;
BEGIN
  IF NOT public.rbac_is_enabled_for_org(p_org_id) THEN
    RAISE EXCEPTION 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(p_new_role_name);
  invite_right := public.transform_role_to_invite(legacy_right);

  UPDATE public.org_users
  SET user_right = invite_right,
      rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND user_right::text LIKE 'invite_%';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_new_role_id uuid;
  v_existing_binding_id uuid;
  v_org_created_by uuid;
  v_role_family text;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent changing the org owner's role
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Validate the new role exists and is an org-level role
  SELECT r.id, r.scope_type INTO v_new_role_id, v_role_family
  FROM public.roles r
  WHERE r.name = p_new_role_name
  LIMIT 1;

  IF v_new_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF v_role_family != public.rbac_scope_org() THEN
    RAISE EXCEPTION 'ROLE_MUST_BE_ORG_LEVEL';
  END IF;

  -- Check if changing from super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 AND p_new_role_name != public.rbac_role_org_super_admin() THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
    AND r.scope_type = public.rbac_scope_org()
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  -- Create new role binding
  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    app_id,
    channel_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  ) VALUES (
    public.rbac_principal_user(),
    p_user_id,
    v_new_role_id,
    public.rbac_scope_org(),
    p_org_id,
    NULL,
    NULL,
    auth.uid(),
    NOW(),
    'Role updated via update_org_member_role',
    true
  );

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") IS 'Updates an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';



CREATE OR REPLACE FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  role_id uuid;
  legacy_right public.user_min_right;
  api_key_text text;
BEGIN
  IF NOT public.rbac_is_enabled_for_org(p_org_id) THEN
    RAISE EXCEPTION 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(p_new_role_name);

  UPDATE public.tmp_users
  SET role = legacy_right,
      rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND email = p_email
    AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_webhook_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_webhook_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- Check if a row already exists for this app_id, version_id with same sign
  IF p_size > 0 THEN
    -- Check for existing positive size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta 
    WHERE public.version_meta.app_id = p_app_id 
      AND public.version_meta.version_id = p_version_id 
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    -- Check for existing negative size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta 
    WHERE public.version_meta.app_id = p_app_id 
      AND public.version_meta.version_id = p_version_id 
      AND public.version_meta.size < 0;
  END IF;

  -- If row already exists, do nothing and return false
  IF existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  -- Insert the new row
  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (p_app_id, p_version_id, p_size);
  
  -- Return true to indicate insertion happened
  RETURN TRUE;
  
EXCEPTION
  WHEN unique_violation THEN
    -- If there's a race condition and constraint is violated, just return false
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_app_id_varchar text;
  v_org_id uuid;
  v_caller_id uuid;
BEGIN
  -- Use SELECT to evaluate auth.uid() once
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fetch app_id varchar and org_id from apps table
  SELECT app_id, owner_org INTO v_app_id_varchar, v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_app_id_varchar IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Use rbac_has_permission to check the permission
  RETURN public.rbac_has_permission(
    public.rbac_principal_user(),
    p_user_id,
    public.rbac_perm_app_update_user_roles(),
    v_org_id,
    v_app_id_varchar,
    NULL
  );
END;
$$;


ALTER FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks whether a user has app.update_user_roles permission (bypasses RLS to avoid recursion). Optimized with SELECT auth.uid() pattern.';



CREATE OR REPLACE FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
BEGIN
  -- Use SELECT to evaluate auth.uid() once
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    SELECT owner_org INTO v_org_id
    FROM public.apps
    WHERE id = p_app_id
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
  );
END;
$$;


ALTER FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks whether a user has a role in an app (bypasses RLS to avoid recursion). Optimized with SELECT auth.uid() pattern.';



CREATE OR REPLACE FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_policy_config jsonb;
    org_policy_hash text;
    compliance_record_hash text;
BEGIN
    -- Get org's password policy config
    SELECT password_policy_config
    INTO org_policy_config
    FROM public.orgs
    WHERE public.orgs.id = user_meets_password_policy.org_id;

    -- If no policy or policy is disabled, user passes
    IF org_policy_config IS NULL OR COALESCE((org_policy_config->>'enabled')::boolean, false) = false THEN
        RETURN true;
    END IF;

    -- Compute the hash of the current policy
    org_policy_hash := public.get_password_policy_hash(org_policy_config);

    -- Check if user has a valid compliance record with matching policy hash
    SELECT policy_hash INTO compliance_record_hash
    FROM public.user_password_compliance
    WHERE public.user_password_compliance.user_id = user_meets_password_policy.user_id
      AND public.user_password_compliance.org_id = user_meets_password_policy.org_id;

    -- User passes if they have a compliance record AND the policy hash matches
    -- (If policy changed, they need to re-validate)
    RETURN compliance_record_hash IS NOT NULL AND compliance_record_hash = org_policy_hash;
END;
$$;


ALTER FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN encode(extensions.digest(plain_key, 'sha256'), 'hex') = stored_hash;
END;
$$;


ALTER FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_mfa"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (
    array[(SELECT coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
      SELECT
          CASE
            WHEN count(id) > 0 THEN array['aal2']
            ELSE array['aal1', 'aal2']
          END AS aal
        FROM auth.mfa_factors
        WHERE (SELECT auth.uid()) = user_id AND status = 'verified'
    )
  ) OR (
    EXISTS(
      SELECT 1 FROM jsonb_array_elements((SELECT auth.jwt())->'amr') AS amr_elem
      WHERE amr_elem->>'method' = 'otp'
    )
  );
END;  
$$;


ALTER FUNCTION "public"."verify_mfa"() OWNER TO "postgres";


ALTER TABLE "public"."apikeys" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikeys_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."app_metrics_cache" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_metrics_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."app_versions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_versions_meta" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "checksum" character varying NOT NULL,
    "size" bigint NOT NULL,
    "id" bigint NOT NULL,
    "owner_org" "uuid" NOT NULL
);


ALTER TABLE "public"."app_versions_meta" OWNER TO "postgres";


ALTER TABLE "public"."app_versions_meta" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "icon_url" character varying NOT NULL,
    "user_id" "uuid",
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "retention" bigint DEFAULT '2592000'::bigint NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "default_upload_channel" character varying DEFAULT 'production'::character varying NOT NULL,
    "transfer_history" "jsonb"[] DEFAULT '{}'::"jsonb"[],
    "channel_device_count" bigint DEFAULT 0 NOT NULL,
    "manifest_bundle_count" bigint DEFAULT 0 NOT NULL,
    "expose_metadata" boolean DEFAULT false NOT NULL,
    "allow_preview" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."apps" REPLICA IDENTITY FULL;


ALTER TABLE "public"."apps" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apps"."id" IS 'UUID scope id for RBAC (app-level roles reference this id).';



COMMENT ON COLUMN "public"."apps"."expose_metadata" IS 'When true, bundle link and comment metadata are exposed to the plugin in update responses';



COMMENT ON COLUMN "public"."apps"."allow_preview" IS 'When true, bundle preview is enabled for this app';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "old_record" "jsonb",
    "new_record" "jsonb",
    "changed_fields" "text"[]
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'Audit log for tracking changes to orgs, apps, channels, app_versions, and org_users tables';



COMMENT ON COLUMN "public"."audit_logs"."table_name" IS 'Name of the table that was modified (orgs, apps, channels, app_versions, org_users)';



COMMENT ON COLUMN "public"."audit_logs"."record_id" IS 'Primary key of the affected record';



COMMENT ON COLUMN "public"."audit_logs"."operation" IS 'Type of operation: INSERT, UPDATE, or DELETE';



COMMENT ON COLUMN "public"."audit_logs"."user_id" IS 'User who made the change (from auth.uid() or API key)';



COMMENT ON COLUMN "public"."audit_logs"."org_id" IS 'Organization context for filtering';



COMMENT ON COLUMN "public"."audit_logs"."old_record" IS 'Previous state of the record (null for INSERT)';



COMMENT ON COLUMN "public"."audit_logs"."new_record" IS 'New state of the record (null for DELETE)';



COMMENT ON COLUMN "public"."audit_logs"."changed_fields" IS 'Array of field names that changed (for UPDATE operations)';



CREATE SEQUENCE IF NOT EXISTS "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_logs_id_seq" OWNED BY "public"."audit_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."bandwidth_usage" (
    "id" integer NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "file_size" bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."bandwidth_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bandwidth_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNED BY "public"."bandwidth_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."build_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "build_id" character varying NOT NULL,
    "platform" character varying NOT NULL,
    "billable_seconds" bigint NOT NULL,
    "build_time_unit" bigint NOT NULL,
    CONSTRAINT "build_logs_billable_seconds_check" CHECK (("billable_seconds" >= 0)),
    CONSTRAINT "build_logs_build_time_unit_check" CHECK (("build_time_unit" >= 0)),
    CONSTRAINT "build_logs_platform_check" CHECK ((("platform")::"text" = ANY (ARRAY[('ios'::character varying)::"text", ('android'::character varying)::"text"])))
);


ALTER TABLE "public"."build_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."build_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_id" character varying NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "platform" character varying NOT NULL,
    "build_mode" character varying DEFAULT 'release'::character varying NOT NULL,
    "build_config" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying DEFAULT 'pending'::character varying NOT NULL,
    "builder_job_id" character varying,
    "upload_session_key" character varying NOT NULL,
    "upload_path" character varying NOT NULL,
    "upload_url" character varying NOT NULL,
    "upload_expires_at" timestamp with time zone NOT NULL,
    "last_error" "text",
    CONSTRAINT "build_requests_platform_check" CHECK ((("platform")::"text" = ANY ((ARRAY['ios'::character varying, 'android'::character varying])::"text"[])))
);


ALTER TABLE "public"."build_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capgo_credits_steps" (
    "id" bigint NOT NULL,
    "step_min" bigint NOT NULL,
    "step_max" bigint NOT NULL,
    "price_per_unit" double precision NOT NULL,
    "type" "text" NOT NULL,
    "unit_factor" bigint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    CONSTRAINT "step_range_check" CHECK (("step_min" < "step_max"))
);


ALTER TABLE "public"."capgo_credits_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."capgo_credits_steps" IS 'Table to store token pricing tiers';



COMMENT ON COLUMN "public"."capgo_credits_steps"."id" IS 'The unique identifier for the pricing tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."step_min" IS 'The minimum number of credits for this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."step_max" IS 'The maximum number of credits for this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."price_per_unit" IS 'The price per token in this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."unit_factor" IS 'The unit conversion factor (e.g., bytes to GB = 1073741824)';



COMMENT ON COLUMN "public"."capgo_credits_steps"."created_at" IS 'Timestamp when the tier was created';



COMMENT ON COLUMN "public"."capgo_credits_steps"."updated_at" IS 'Timestamp when the tier was last updated';



COMMENT ON COLUMN "public"."capgo_credits_steps"."org_id" IS 'Optional organization owner for this pricing tier';



CREATE SEQUENCE IF NOT EXISTS "public"."capgo_credits_steps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."capgo_credits_steps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."capgo_credits_steps_id_seq" OWNED BY "public"."capgo_credits_steps"."id";



CREATE TABLE IF NOT EXISTS "public"."channel_devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_id" "text" NOT NULL,
    "id" bigint NOT NULL,
    "owner_org" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."channel_devices" REPLICA IDENTITY FULL;


ALTER TABLE "public"."channel_devices" OWNER TO "postgres";


ALTER TABLE "public"."channel_devices" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_devices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying NOT NULL,
    "app_id" character varying NOT NULL,
    "version" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public" boolean DEFAULT false NOT NULL,
    "disable_auto_update_under_native" boolean DEFAULT true NOT NULL,
    "ios" boolean DEFAULT true NOT NULL,
    "android" boolean DEFAULT true NOT NULL,
    "allow_device_self_set" boolean DEFAULT false NOT NULL,
    "allow_emulator" boolean DEFAULT true NOT NULL,
    "allow_dev" boolean DEFAULT true NOT NULL,
    "disable_auto_update" "public"."disable_update" DEFAULT 'major'::"public"."disable_update" NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "allow_device" boolean DEFAULT true NOT NULL,
    "allow_prod" boolean DEFAULT true NOT NULL,
    "electron" boolean DEFAULT true NOT NULL,
    "rbac_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);

ALTER TABLE ONLY "public"."channels" REPLICA IDENTITY FULL;


ALTER TABLE "public"."channels" OWNER TO "postgres";


COMMENT ON COLUMN "public"."channels"."rbac_id" IS 'Stable UUID to bind RBAC roles to channel scope.';



ALTER TABLE "public"."channels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cron_tasks" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "task_type" "public"."cron_task_type" DEFAULT 'function'::"public"."cron_task_type" NOT NULL,
    "target" "text" NOT NULL,
    "batch_size" integer,
    "payload" "jsonb",
    "second_interval" integer,
    "minute_interval" integer,
    "hour_interval" integer,
    "run_at_hour" integer,
    "run_at_minute" integer,
    "run_at_second" integer DEFAULT 0,
    "run_on_dow" integer,
    "run_on_day" integer,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cron_tasks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cron_tasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cron_tasks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cron_tasks_id_seq" OWNED BY "public"."cron_tasks"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_bandwidth" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "bandwidth" bigint NOT NULL
);


ALTER TABLE "public"."daily_bandwidth" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_bandwidth_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNED BY "public"."daily_bandwidth"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_build_time" (
    "app_id" character varying NOT NULL,
    "date" "date" NOT NULL,
    "build_time_unit" bigint DEFAULT 0 NOT NULL,
    "build_count" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "daily_build_time_build_count_check" CHECK (("build_count" >= 0)),
    CONSTRAINT "daily_build_time_build_time_unit_check" CHECK (("build_time_unit" >= 0))
);


ALTER TABLE "public"."daily_build_time" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_mau" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "mau" bigint NOT NULL
);


ALTER TABLE "public"."daily_mau" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_mau_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_mau_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_mau_id_seq" OWNED BY "public"."daily_mau"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_storage" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "storage" bigint NOT NULL
);


ALTER TABLE "public"."daily_storage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_storage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_storage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_storage_id_seq" OWNED BY "public"."daily_storage"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_version" (
    "date" "date" NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "version_id" bigint,
    "get" bigint,
    "fail" bigint,
    "install" bigint,
    "uninstall" bigint,
    "version_name" character varying(255) NOT NULL
);


ALTER TABLE "public"."daily_version" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_account" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying DEFAULT ''::character varying NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."deleted_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_apps" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deleted_apps" OWNER TO "postgres";


ALTER TABLE "public"."deleted_apps" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deleted_apps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deploy_history" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "version_id" bigint NOT NULL,
    "deployed_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "install_stats_email_sent_at" timestamp with time zone
);


ALTER TABLE "public"."deploy_history" OWNER TO "postgres";


ALTER TABLE "public"."deploy_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deploy_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."device_usage" (
    "id" integer NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "org_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."device_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."devices" (
    "updated_at" timestamp with time zone NOT NULL,
    "device_id" "text" NOT NULL,
    "version" bigint,
    "app_id" character varying(50) NOT NULL,
    "platform" "public"."platform_os" NOT NULL,
    "plugin_version" character varying(20) DEFAULT '2.3.3'::"text" NOT NULL,
    "os_version" character varying(20),
    "version_build" character varying(70) DEFAULT 'builtin'::"text",
    "custom_id" character varying(36) DEFAULT ''::"text" NOT NULL,
    "is_prod" boolean DEFAULT true,
    "is_emulator" boolean DEFAULT false,
    "id" bigint NOT NULL,
    "version_name" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "default_channel" character varying(255),
    "key_id" character varying(4)
);


ALTER TABLE "public"."devices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."devices"."default_channel" IS 'The default channel name that the device is configured to request updates from';



COMMENT ON COLUMN "public"."devices"."key_id" IS 'First 4 characters of the base64-encoded public key (identifies which key is in use)';



ALTER TABLE "public"."devices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."devices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."devices_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."devices_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."devices_usage_id_seq" OWNED BY "public"."device_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."global_stats" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date_id" character varying NOT NULL,
    "apps" bigint NOT NULL,
    "updates" bigint NOT NULL,
    "stars" bigint NOT NULL,
    "users" bigint DEFAULT '0'::bigint,
    "paying" bigint DEFAULT '0'::bigint,
    "trial" bigint DEFAULT '0'::bigint,
    "need_upgrade" bigint DEFAULT '0'::bigint,
    "not_paying" bigint DEFAULT '0'::bigint,
    "onboarded" bigint DEFAULT '0'::bigint,
    "apps_active" integer DEFAULT 0,
    "users_active" integer DEFAULT 0,
    "paying_monthly" integer DEFAULT 0,
    "paying_yearly" integer DEFAULT 0,
    "updates_last_month" bigint DEFAULT '0'::bigint,
    "updates_external" bigint DEFAULT '0'::bigint,
    "devices_last_month" bigint DEFAULT 0,
    "success_rate" double precision,
    "plan_solo" bigint DEFAULT 0,
    "plan_maker" bigint DEFAULT 0,
    "plan_team" bigint DEFAULT 0,
    "registers_today" bigint DEFAULT 0 NOT NULL,
    "bundle_storage_gb" double precision DEFAULT 0 NOT NULL,
    "mrr" double precision DEFAULT 0 NOT NULL,
    "total_revenue" double precision DEFAULT 0 NOT NULL,
    "revenue_solo" double precision DEFAULT 0 NOT NULL,
    "revenue_maker" double precision DEFAULT 0 NOT NULL,
    "revenue_team" double precision DEFAULT 0 NOT NULL,
    "plan_solo_monthly" integer DEFAULT 0 NOT NULL,
    "plan_solo_yearly" integer DEFAULT 0 NOT NULL,
    "plan_maker_monthly" integer DEFAULT 0 NOT NULL,
    "plan_maker_yearly" integer DEFAULT 0 NOT NULL,
    "plan_team_monthly" integer DEFAULT 0 NOT NULL,
    "plan_team_yearly" integer DEFAULT 0 NOT NULL,
    "credits_bought" bigint DEFAULT 0 NOT NULL,
    "credits_consumed" bigint DEFAULT 0 NOT NULL,
    "new_paying_orgs" integer DEFAULT 0 NOT NULL,
    "canceled_orgs" integer DEFAULT 0 NOT NULL,
    "revenue_enterprise" double precision DEFAULT 0 NOT NULL,
    "plan_enterprise_monthly" integer DEFAULT 0 NOT NULL,
    "plan_enterprise_yearly" integer DEFAULT 0 NOT NULL,
    "plan_enterprise" integer DEFAULT 0,
    "devices_last_month_ios" bigint DEFAULT 0,
    "devices_last_month_android" bigint DEFAULT 0,
    "plugin_version_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plugin_major_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "builds_total" bigint DEFAULT 0,
    "builds_ios" bigint DEFAULT 0,
    "builds_android" bigint DEFAULT 0,
    "builds_last_month" bigint DEFAULT 0,
    "builds_last_month_ios" bigint DEFAULT 0,
    "builds_last_month_android" bigint DEFAULT 0,
    "upgraded_orgs" integer DEFAULT 0 NOT NULL,
    "builds_success_total" bigint DEFAULT 0,
    "builds_success_ios" bigint DEFAULT 0,
    "builds_success_android" bigint DEFAULT 0
);


ALTER TABLE "public"."global_stats" OWNER TO "postgres";


COMMENT ON COLUMN "public"."global_stats"."mrr" IS 'Total Monthly Recurring Revenue in dollars';



COMMENT ON COLUMN "public"."global_stats"."total_revenue" IS 'Total Annual Recurring Revenue (ARR) in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_solo" IS 'Solo plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_maker" IS 'Maker plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_team" IS 'Team plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."plan_solo_monthly" IS 'Number of Solo plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_solo_yearly" IS 'Number of Solo plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_maker_monthly" IS 'Number of Maker plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_maker_yearly" IS 'Number of Maker plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_team_monthly" IS 'Number of Team plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_team_yearly" IS 'Number of Team plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."credits_bought" IS 'Total credits purchased today';



COMMENT ON COLUMN "public"."global_stats"."credits_consumed" IS 'Total credits consumed today';



COMMENT ON COLUMN "public"."global_stats"."revenue_enterprise" IS 'Enterprise plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."plan_enterprise_monthly" IS 'Number of Enterprise plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_enterprise_yearly" IS 'Number of Enterprise plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plugin_version_breakdown" IS 'JSON breakdown of plugin version percentages. Format: {"version": percentage, ...}';



COMMENT ON COLUMN "public"."global_stats"."plugin_major_breakdown" IS 'JSON breakdown of plugin major version percentages. Format: {"major_version": percentage, ...}';



COMMENT ON COLUMN "public"."global_stats"."builds_total" IS 'Total number of native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_ios" IS 'Total number of iOS native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_android" IS 'Total number of Android native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month" IS 'Number of native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month_ios" IS 'Number of iOS native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month_android" IS 'Number of Android native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."upgraded_orgs" IS 'Number of organizations that upgraded plans in the last 24 hours';



COMMENT ON COLUMN "public"."global_stats"."builds_success_total" IS 'Total number of successful native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_success_ios" IS 'Total number of successful iOS native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_success_android" IS 'Total number of successful Android native builds recorded (all time)';



CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."group_members" IS 'Membership join table linking users to groups.';



CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."groups" IS 'Org-scoped groups/teams. Groups are a principal for role bindings.';



CREATE TABLE IF NOT EXISTS "public"."manifest" (
    "id" integer NOT NULL,
    "app_version_id" bigint NOT NULL,
    "file_name" character varying NOT NULL,
    "s3_path" character varying NOT NULL,
    "file_hash" character varying NOT NULL,
    "file_size" bigint DEFAULT 0
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');

ALTER TABLE ONLY "public"."manifest" REPLICA IDENTITY FULL;


ALTER TABLE "public"."manifest" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."manifest_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."manifest_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."manifest_id_seq" OWNED BY "public"."manifest"."id";



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_send" bigint DEFAULT '1'::bigint NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "event" character varying(255) NOT NULL,
    "uniq_id" character varying(255) NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "app_id" character varying,
    "channel_id" bigint,
    "user_right" "public"."user_min_right",
    "rbac_role_name" "text"
);


ALTER TABLE "public"."org_users" OWNER TO "postgres";


ALTER TABLE "public"."org_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."org_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "logo" "text",
    "name" "text" NOT NULL,
    "management_email" "text" NOT NULL,
    "customer_id" character varying,
    "stats_updated_at" timestamp without time zone,
    "last_stats_updated_at" timestamp without time zone,
    "enforcing_2fa" boolean DEFAULT false NOT NULL,
    "email_preferences" "jsonb" DEFAULT '{"onboarding": true, "usage_limit": true, "credit_usage": true, "device_error": true, "weekly_stats": true, "monthly_stats": true, "bundle_created": true, "bundle_deployed": true, "deploy_stats_24h": true, "billing_period_stats": true, "channel_self_rejected": true}'::"jsonb" NOT NULL,
    "password_policy_config" "jsonb",
    "enforce_hashed_api_keys" boolean DEFAULT false NOT NULL,
    "require_apikey_expiration" boolean DEFAULT false NOT NULL,
    "max_apikey_expiration_days" integer,
    "enforce_encrypted_bundles" boolean DEFAULT false NOT NULL,
    "required_encryption_key" character varying(21) DEFAULT NULL::character varying,
    "use_new_rbac" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."orgs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orgs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orgs"."enforcing_2fa" IS 'When true, all members of this organization must have 2FA enabled to access the organization';



COMMENT ON COLUMN "public"."orgs"."email_preferences" IS 'JSONB object containing email notification preferences for the organization. When enabled, emails are also sent to the management_email if it differs from admin user emails. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. All default to true.';



COMMENT ON COLUMN "public"."orgs"."password_policy_config" IS 'JSON configuration for password policy: {enabled: boolean, min_length: number, require_uppercase: boolean, require_number: boolean, require_special: boolean}';



COMMENT ON COLUMN "public"."orgs"."enforce_hashed_api_keys" IS 'When true, only hashed API keys can access this organization. Plain-text keys will be rejected.';



COMMENT ON COLUMN "public"."orgs"."require_apikey_expiration" IS 'When true, API keys used with this organization must have an expiration date set.';



COMMENT ON COLUMN "public"."orgs"."max_apikey_expiration_days" IS 'Maximum number of days an API key can be valid when creating/updating keys limited to this org. NULL means no maximum.';



COMMENT ON COLUMN "public"."orgs"."enforce_encrypted_bundles" IS 'When true, all bundles uploaded to this organization must be encrypted (have session_key set). Unencrypted bundles will be rejected.';



COMMENT ON COLUMN "public"."orgs"."required_encryption_key" IS 'Optional: First 21 characters of the base64-encoded public key. When set, only bundles encrypted with this specific key (matching key_id) will be accepted.';



COMMENT ON COLUMN "public"."orgs"."use_new_rbac" IS 'Feature flag: when true, org uses RBAC instead of legacy org_users rights.';



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "bundle_id" bigint,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permissions_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()])))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."permissions" IS 'Atomic permission keys; used by role_permissions. Only priority permissions are seeded in Phase 1.';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying DEFAULT ''::character varying NOT NULL,
    "description" character varying DEFAULT ''::character varying NOT NULL,
    "price_m" bigint DEFAULT '0'::bigint NOT NULL,
    "price_y" bigint DEFAULT '0'::bigint NOT NULL,
    "stripe_id" character varying DEFAULT ''::character varying NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_m_id" character varying NOT NULL,
    "price_y_id" character varying NOT NULL,
    "storage" bigint NOT NULL,
    "bandwidth" bigint NOT NULL,
    "mau" bigint DEFAULT '0'::bigint NOT NULL,
    "market_desc" character varying DEFAULT ''::character varying,
    "build_time_unit" bigint DEFAULT 0 NOT NULL,
    "credit_id" "text" NOT NULL
);

ALTER TABLE ONLY "public"."plans" REPLICA IDENTITY FULL;


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."build_time_unit" IS 'Maximum build time in seconds per billing cycle';



COMMENT ON COLUMN "public"."plans"."credit_id" IS 'Stripe product identifier used for purchasing additional credits.';



CREATE TABLE IF NOT EXISTS "public"."rbac_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "use_new_rbac" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rbac_settings_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."rbac_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."rbac_settings" IS 'Singleton row to flip RBAC on globally without touching org records.';



COMMENT ON COLUMN "public"."rbac_settings"."use_new_rbac" IS 'Global RBAC flag. Legacy permissions remain default (false).';



CREATE TABLE IF NOT EXISTS "public"."role_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "principal_type" "text" NOT NULL,
    "principal_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "scope_type" "text" NOT NULL,
    "org_id" "uuid",
    "app_id" "uuid",
    "bundle_id" bigint,
    "channel_id" "uuid",
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "reason" "text",
    "is_direct" boolean DEFAULT true NOT NULL,
    CONSTRAINT "role_bindings_check" CHECK (((("scope_type" = "public"."rbac_scope_platform"()) AND ("org_id" IS NULL) AND ("app_id" IS NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_org"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_app"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_bundle"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NOT NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_channel"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NOT NULL)))),
    CONSTRAINT "role_bindings_principal_type_check" CHECK (("principal_type" = ANY (ARRAY["public"."rbac_principal_user"(), "public"."rbac_principal_group"(), "public"."rbac_principal_apikey"()]))),
    CONSTRAINT "role_bindings_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()])))
);


ALTER TABLE "public"."role_bindings" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_bindings" IS 'Assign roles to principals at a scope. SSD: only one role per scope_type per scope/principal.';



CREATE TABLE IF NOT EXISTS "public"."role_hierarchy" (
    "parent_role_id" "uuid" NOT NULL,
    "child_role_id" "uuid" NOT NULL,
    CONSTRAINT "role_hierarchy_check" CHECK (("parent_role_id" IS DISTINCT FROM "child_role_id"))
);


ALTER TABLE "public"."role_hierarchy" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_hierarchy" IS 'Explicit role inheritance. Parent inherits all permissions of its children (acyclic by convention).';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Join table assigning permission keys to roles.';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "description" "text",
    "priority_rank" integer DEFAULT 0 NOT NULL,
    "is_assignable" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "roles_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()])))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'Canonical RBAC roles. Scope_type indicates the native scope the role is defined for.';



CREATE TABLE IF NOT EXISTS "public"."stats" (
    "created_at" timestamp with time zone NOT NULL,
    "action" "public"."stats_action" NOT NULL,
    "device_id" character varying(36) NOT NULL,
    "app_id" character varying(50) NOT NULL,
    "id" bigint NOT NULL,
    "version_name" "text" DEFAULT 'unknown'::"text" NOT NULL
);


ALTER TABLE "public"."stats" OWNER TO "postgres";


ALTER TABLE "public"."stats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."storage_usage" (
    "id" integer NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "file_size" bigint NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."storage_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."storage_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."storage_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."storage_usage_id_seq" OWNED BY "public"."storage_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."stripe_info" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_id" character varying,
    "customer_id" character varying NOT NULL,
    "status" "public"."stripe_status",
    "product_id" character varying NOT NULL,
    "trial_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_id" character varying,
    "is_good_plan" boolean DEFAULT true,
    "plan_usage" bigint DEFAULT '0'::bigint,
    "subscription_anchor_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_anchor_end" timestamp with time zone DEFAULT "public"."one_month_ahead"() NOT NULL,
    "canceled_at" timestamp with time zone,
    "mau_exceeded" boolean DEFAULT false,
    "storage_exceeded" boolean DEFAULT false,
    "bandwidth_exceeded" boolean DEFAULT false,
    "id" integer NOT NULL,
    "plan_calculated_at" timestamp with time zone,
    "build_time_exceeded" boolean DEFAULT false,
    "upgraded_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."stripe_info" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stripe_info" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stripe_info"."build_time_exceeded" IS 'Organization exceeded build time limit';



COMMENT ON COLUMN "public"."stripe_info"."upgraded_at" IS 'Timestamp of last paid plan upgrade for the org';



CREATE SEQUENCE IF NOT EXISTS "public"."stripe_info_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stripe_info_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stripe_info_id_seq" OWNED BY "public"."stripe_info"."id";



CREATE TABLE IF NOT EXISTS "public"."tmp_users" (
    "id" integer NOT NULL,
    "email" "text" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "public"."user_min_right" NOT NULL,
    "invite_magic_string" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(128), 'hex'::"text") NOT NULL,
    "future_uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rbac_role_name" "text"
);


ALTER TABLE "public"."tmp_users" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tmp_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tmp_users_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tmp_users_id_seq" OWNED BY "public"."tmp_users"."id";



CREATE TABLE IF NOT EXISTS "public"."to_delete_accounts" (
    "id" integer NOT NULL,
    "account_id" "uuid" NOT NULL,
    "removed_data" "jsonb",
    "removal_date" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."to_delete_accounts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."to_delete_accounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."to_delete_accounts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."to_delete_accounts_id_seq" OWNED BY "public"."to_delete_accounts"."id";



CREATE TABLE IF NOT EXISTS "public"."usage_credit_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "credits_total" numeric(18,6) NOT NULL,
    "credits_consumed" numeric(18,6) DEFAULT 0 NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '1 year'::interval) NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_ref" "jsonb",
    "notes" "text",
    CONSTRAINT "usage_credit_grants_check" CHECK (("credits_consumed" <= "credits_total")),
    CONSTRAINT "usage_credit_grants_credits_consumed_check" CHECK (("credits_consumed" >= (0)::numeric)),
    CONSTRAINT "usage_credit_grants_credits_total_check" CHECK (("credits_total" >= (0)::numeric)),
    CONSTRAINT "usage_credit_grants_source_check" CHECK (("source" = ANY ('{manual,stripe_top_up}'::"text"[])))
);


ALTER TABLE "public"."usage_credit_grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_grants" IS 'Records every block of credits granted to an org, tracking totals, consumption and expiry.';



CREATE OR REPLACE VIEW "public"."usage_credit_balances" WITH ("security_invoker"='true') AS
 SELECT "org_id",
    "sum"(GREATEST("credits_total", (0)::numeric)) AS "total_credits",
    "sum"(GREATEST(
        CASE
            WHEN ("expires_at" >= "now"()) THEN ("credits_total" - "credits_consumed")
            ELSE (0)::numeric
        END, (0)::numeric)) AS "available_credits",
    "min"(
        CASE
            WHEN (("credits_total" - "credits_consumed") > (0)::numeric) THEN "expires_at"
            ELSE NULL::timestamp with time zone
        END) AS "next_expiration"
   FROM "public"."usage_credit_grants"
  GROUP BY "org_id";


ALTER VIEW "public"."usage_credit_balances" OWNER TO "postgres";


COMMENT ON VIEW "public"."usage_credit_balances" IS 'Aggregated balance view per org: total credits granted, remaining unexpired credits, and the closest upcoming expiry. Respects RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."usage_credit_consumptions" (
    "id" bigint NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "overage_event_id" "uuid",
    "metric" "public"."credit_metric_type" NOT NULL,
    "credits_used" numeric(18,6) NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_credit_consumptions_credits_used_check" CHECK (("credits_used" > (0)::numeric))
);


ALTER TABLE "public"."usage_credit_consumptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_consumptions" IS 'Detailed allocation records showing which grants covered each overage event and how many credits were used.';



CREATE SEQUENCE IF NOT EXISTS "public"."usage_credit_consumptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."usage_credit_consumptions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."usage_credit_consumptions_id_seq" OWNED BY "public"."usage_credit_consumptions"."id";



CREATE TABLE IF NOT EXISTS "public"."usage_credit_transactions" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "grant_id" "uuid",
    "transaction_type" "public"."credit_transaction_type" NOT NULL,
    "amount" numeric(18,6) NOT NULL,
    "balance_after" numeric(18,6),
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "source_ref" "jsonb"
);


ALTER TABLE "public"."usage_credit_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_transactions" IS 'General ledger of credit movements (grants, purchases, deductions, expiries, refunds) with running balances.';



CREATE TABLE IF NOT EXISTS "public"."usage_overage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metric" "public"."credit_metric_type" NOT NULL,
    "overage_amount" numeric(20,6) NOT NULL,
    "credits_estimated" numeric(18,6) NOT NULL,
    "credits_debited" numeric(18,6) DEFAULT 0 NOT NULL,
    "credit_step_id" bigint,
    "billing_cycle_start" "date",
    "billing_cycle_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "details" "jsonb",
    CONSTRAINT "usage_overage_events_credits_debited_check" CHECK (("credits_debited" >= (0)::numeric)),
    CONSTRAINT "usage_overage_events_credits_estimated_check" CHECK (("credits_estimated" >= (0)::numeric)),
    CONSTRAINT "usage_overage_events_overage_amount_check" CHECK (("overage_amount" >= (0)::numeric))
);


ALTER TABLE "public"."usage_overage_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_overage_events" IS 'Snapshots of detected plan overages, capturing usage, credits applied, and linkage back to pricing tiers.';



CREATE OR REPLACE VIEW "public"."usage_credit_ledger" WITH ("security_invoker"='true', "security_barrier"='true') AS
 WITH "overage_allocations" AS (
         SELECT "e"."id" AS "overage_event_id",
            "e"."org_id",
            "e"."metric",
            "e"."overage_amount",
            "e"."credits_estimated",
            "e"."credits_debited",
            "e"."billing_cycle_start",
            "e"."billing_cycle_end",
            "e"."created_at",
            "e"."details",
            COALESCE("sum"("c"."credits_used"), (0)::numeric) AS "credits_applied",
            "jsonb_agg"("jsonb_build_object"('grant_id', "c"."grant_id", 'credits_used', "c"."credits_used", 'grant_source', "g"."source", 'grant_expires_at', "g"."expires_at", 'grant_notes', "g"."notes") ORDER BY "g"."expires_at", "g"."granted_at") FILTER (WHERE ("c"."grant_id" IS NOT NULL)) AS "grant_allocations"
           FROM (("public"."usage_overage_events" "e"
             LEFT JOIN "public"."usage_credit_consumptions" "c" ON (("e"."id" = "c"."overage_event_id")))
             LEFT JOIN "public"."usage_credit_grants" "g" ON (("c"."grant_id" = "g"."id")))
          GROUP BY "e"."id", "e"."org_id", "e"."metric", "e"."overage_amount", "e"."credits_estimated", "e"."credits_debited", "e"."billing_cycle_start", "e"."billing_cycle_end", "e"."created_at", "e"."details"
        ), "aggregated_deductions" AS (
         SELECT "a"."org_id",
            'deduction'::"public"."credit_transaction_type" AS "transaction_type",
            "a"."overage_event_id",
            "a"."metric",
            "a"."overage_amount",
            "a"."billing_cycle_start",
            "a"."billing_cycle_end",
            "a"."grant_allocations",
            "a"."details",
            "min"("t"."id") AS "id",
            "sum"("t"."amount") AS "amount",
            "min"("t"."balance_after") AS "balance_after",
            "max"("t"."occurred_at") AS "occurred_at",
            "min"("t"."description") AS "description_raw",
            COALESCE(NULLIF(("a"."details" ->> 'note'::"text"), ''::"text"), NULLIF(("a"."details" ->> 'description'::"text"), ''::"text"), "min"("t"."description"), "format"('Overage %s'::"text", ("a"."metric")::"text")) AS "description",
            "jsonb_build_object"('overage_event_id', "a"."overage_event_id", 'metric', ("a"."metric")::"text", 'overage_amount', "a"."overage_amount", 'grant_allocations', "a"."grant_allocations") AS "source_ref"
           FROM ("public"."usage_credit_transactions" "t"
             JOIN "overage_allocations" "a" ON (((("t"."source_ref" ->> 'overage_event_id'::"text"))::"uuid" = "a"."overage_event_id")))
          WHERE (("t"."transaction_type" = 'deduction'::"public"."credit_transaction_type") AND ("t"."source_ref" ? 'overage_event_id'::"text"))
          GROUP BY "a"."overage_event_id", "a"."metric", "a"."overage_amount", "a"."billing_cycle_start", "a"."billing_cycle_end", "a"."grant_allocations", "a"."details", "a"."org_id"
        ), "other_transactions" AS (
         SELECT "t"."id",
            "t"."org_id",
            "t"."transaction_type",
            "t"."amount",
            "t"."balance_after",
            "t"."occurred_at",
            "t"."description",
            "t"."source_ref",
            NULL::"uuid" AS "overage_event_id",
            NULL::"public"."credit_metric_type" AS "metric",
            NULL::numeric AS "overage_amount",
            NULL::"date" AS "billing_cycle_start",
            NULL::"date" AS "billing_cycle_end",
            NULL::"jsonb" AS "grant_allocations"
           FROM "public"."usage_credit_transactions" "t"
          WHERE (("t"."transaction_type" <> 'deduction'::"public"."credit_transaction_type") OR ("t"."source_ref" IS NULL) OR (NOT ("t"."source_ref" ? 'overage_event_id'::"text")))
        )
 SELECT "aggregated_deductions"."id",
    "aggregated_deductions"."org_id",
    "aggregated_deductions"."transaction_type",
    "aggregated_deductions"."amount",
    "aggregated_deductions"."balance_after",
    "aggregated_deductions"."occurred_at",
    "aggregated_deductions"."description",
    "aggregated_deductions"."source_ref",
    "aggregated_deductions"."overage_event_id",
    "aggregated_deductions"."metric",
    "aggregated_deductions"."overage_amount",
    "aggregated_deductions"."billing_cycle_start",
    "aggregated_deductions"."billing_cycle_end",
    "aggregated_deductions"."grant_allocations",
    NULL::"jsonb" AS "details"
   FROM "aggregated_deductions"
UNION ALL
 SELECT "other_transactions"."id",
    "other_transactions"."org_id",
    "other_transactions"."transaction_type",
    "other_transactions"."amount",
    "other_transactions"."balance_after",
    "other_transactions"."occurred_at",
    "other_transactions"."description",
    "other_transactions"."source_ref",
    "other_transactions"."overage_event_id",
    "other_transactions"."metric",
    "other_transactions"."overage_amount",
    "other_transactions"."billing_cycle_start",
    "other_transactions"."billing_cycle_end",
    "other_transactions"."grant_allocations",
    NULL::"jsonb" AS "details"
   FROM "other_transactions";


ALTER VIEW "public"."usage_credit_ledger" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."usage_credit_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."usage_credit_transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."usage_credit_transactions_id_seq" OWNED BY "public"."usage_credit_transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_password_compliance" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "validated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "policy_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_password_compliance" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_password_compliance" IS 'Tracks which users have verified their passwords meet their org password policy requirements';



COMMENT ON COLUMN "public"."user_password_compliance"."policy_hash" IS 'MD5 hash of the password_policy_config when the user validated. If policy changes, user must re-validate.';



ALTER TABLE "public"."user_password_compliance" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_password_compliance_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."users" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "image_url" character varying,
    "first_name" character varying,
    "last_name" character varying,
    "country" character varying,
    "email" character varying NOT NULL,
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "enable_notifications" boolean DEFAULT true NOT NULL,
    "opt_for_newsletters" boolean DEFAULT true NOT NULL,
    "ban_time" timestamp with time zone,
    "email_preferences" "jsonb" DEFAULT '{"onboarding": true, "usage_limit": true, "credit_usage": true, "device_error": true, "weekly_stats": true, "monthly_stats": true, "bundle_created": true, "bundle_deployed": true, "deploy_stats_24h": true, "cli_realtime_feed": true, "billing_period_stats": true, "channel_self_rejected": true}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."email_preferences" IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected, cli_realtime_feed. Values are booleans.';



CREATE TABLE IF NOT EXISTS "public"."version_meta" (
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "version_id" bigint NOT NULL,
    "size" bigint NOT NULL
);


ALTER TABLE "public"."version_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."version_usage" (
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "app_id" character varying(50) NOT NULL,
    "version_id" bigint,
    "action" "public"."version_action" NOT NULL,
    "version_name" character varying(255)
);


ALTER TABLE "public"."version_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "webhook_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "audit_log_id" bigint,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_payload" "jsonb" NOT NULL,
    "response_status" integer,
    "response_body" "text",
    "response_headers" "jsonb",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "secret" "text" DEFAULT ('whsec_'::"text" || "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text")) NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "events" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."webhooks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."webhooks"."secret" IS 'Secret key for HMAC-SHA256 signature verification. Format: whsec_{32-char-hex}';



ALTER TABLE ONLY "public"."audit_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bandwidth_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bandwidth_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."capgo_credits_steps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."capgo_credits_steps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cron_tasks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cron_tasks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_bandwidth" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_bandwidth_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_mau" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_mau_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_storage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_storage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."device_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."devices_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."manifest" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."manifest_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."storage_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."storage_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stripe_info" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stripe_info_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tmp_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tmp_users_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."to_delete_accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."to_delete_accounts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."usage_credit_consumptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."usage_credit_consumptions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."usage_credit_transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."usage_credit_transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_rbac_id_key" UNIQUE ("rbac_id");



ALTER TABLE ONLY "public"."app_metrics_cache"
    ADD CONSTRAINT "app_metrics_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_id_unique" UNIQUE ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("app_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bandwidth_usage"
    ADD CONSTRAINT "bandwidth_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_build_id_org_id_unique" UNIQUE ("build_id", "org_id");



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."capgo_credits_steps"
    ADD CONSTRAINT "capgo_credits_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_device_id_key" UNIQUE ("app_id", "device_id");



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_rbac_id_key" UNIQUE ("rbac_id");



ALTER TABLE ONLY "public"."cron_tasks"
    ADD CONSTRAINT "cron_tasks_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."cron_tasks"
    ADD CONSTRAINT "cron_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_bandwidth"
    ADD CONSTRAINT "daily_bandwidth_app_id_date_key" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_build_time"
    ADD CONSTRAINT "daily_build_time_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_mau"
    ADD CONSTRAINT "daily_mau_app_id_date_key" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_storage"
    ADD CONSTRAINT "daily_storage_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_version"
    ADD CONSTRAINT "daily_version_app_date_version_name_key" UNIQUE ("app_id", "date", "version_name");



ALTER TABLE ONLY "public"."deleted_account"
    ADD CONSTRAINT "deleted_account_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_apps"
    ADD CONSTRAINT "deleted_apps_app_id_owner_org_key" UNIQUE ("app_id", "owner_org");



ALTER TABLE ONLY "public"."deleted_apps"
    ADD CONSTRAINT "deleted_apps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_device_id_app_id_key" UNIQUE ("device_id", "app_id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_usage"
    ADD CONSTRAINT "devices_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_stats"
    ADD CONSTRAINT "global_stats_pkey" PRIMARY KEY ("date_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_org_name_unique" UNIQUE ("org_id", "name");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manifest"
    ADD CONSTRAINT "manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("owner_org", "event", "uniq_id");



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");



ALTER TABLE ONLY "public"."rbac_settings"
    ADD CONSTRAINT "rbac_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_pkey" PRIMARY KEY ("parent_role_id", "child_role_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_usage"
    ADD CONSTRAINT "storage_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."tmp_users"
    ADD CONSTRAINT "tmp_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."to_delete_accounts"
    ADD CONSTRAINT "to_delete_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "unique customer_id on orgs" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "unique_device_app" UNIQUE ("device_id", "app_id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "unique_name_app_id" UNIQUE ("name", "app_id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "unique_name_created_by" UNIQUE ("name", "created_by");



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_credit_grants"
    ADD CONSTRAINT "usage_credit_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."version_meta"
    ADD CONSTRAINT "version_meta_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "size");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



CREATE INDEX "apikeys_key_idx" ON "public"."apikeys" USING "btree" ("key");



CREATE UNIQUE INDEX "app_metrics_cache_org_id_key" ON "public"."app_metrics_cache" USING "btree" ("org_id");



CREATE INDEX "app_versions_cli_version_idx" ON "public"."app_versions" USING "btree" ("cli_version");



CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");



CREATE INDEX "channel_devices_device_id_idx" ON "public"."channel_devices" USING "btree" ("device_id");



CREATE INDEX "deploy_history_app_id_idx" ON "public"."deploy_history" USING "btree" ("app_id");



CREATE INDEX "deploy_history_channel_app_idx" ON "public"."deploy_history" USING "btree" ("channel_id", "app_id");



CREATE INDEX "deploy_history_channel_id_idx" ON "public"."deploy_history" USING "btree" ("channel_id");



CREATE INDEX "deploy_history_deployed_at_idx" ON "public"."deploy_history" USING "btree" ("deployed_at");



CREATE INDEX "deploy_history_version_id_idx" ON "public"."deploy_history" USING "btree" ("version_id");



CREATE INDEX "finx_apikeys_user_id" ON "public"."apikeys" USING "btree" ("user_id");



CREATE INDEX "finx_app_versions_meta_owner_org" ON "public"."app_versions_meta" USING "btree" ("owner_org");



CREATE INDEX "finx_app_versions_owner_org" ON "public"."app_versions" USING "btree" ("owner_org");



CREATE INDEX "finx_apps_owner_org" ON "public"."apps" USING "btree" ("owner_org");



CREATE INDEX "finx_apps_user_id" ON "public"."apps" USING "btree" ("user_id");



CREATE INDEX "finx_channel_devices_channel_id" ON "public"."channel_devices" USING "btree" ("channel_id");



CREATE INDEX "finx_channel_devices_owner_org" ON "public"."channel_devices" USING "btree" ("owner_org");



CREATE INDEX "finx_channels_app_id" ON "public"."channels" USING "btree" ("app_id");



CREATE INDEX "finx_channels_owner_org" ON "public"."channels" USING "btree" ("owner_org");



CREATE INDEX "finx_channels_version" ON "public"."channels" USING "btree" ("version");



CREATE INDEX "finx_org_users_channel_id" ON "public"."org_users" USING "btree" ("channel_id");



CREATE INDEX "finx_org_users_org_id" ON "public"."org_users" USING "btree" ("org_id");



CREATE INDEX "finx_org_users_user_id" ON "public"."org_users" USING "btree" ("user_id");



CREATE INDEX "finx_orgs_created_by" ON "public"."orgs" USING "btree" ("created_by");



CREATE INDEX "finx_orgs_stripe_info" ON "public"."stripe_info" USING "btree" ("product_id");



CREATE INDEX "idx_apikeys_expires_at" ON "public"."apikeys" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_apikeys_key_hash" ON "public"."apikeys" USING "btree" ("key_hash") WHERE ("key_hash" IS NOT NULL);



CREATE INDEX "idx_apikeys_key_mode" ON "public"."apikeys" USING "btree" ("key", "mode");



CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");



CREATE INDEX "idx_app_id_name_app_versions" ON "public"."app_versions" USING "btree" ("app_id", "name");



CREATE INDEX "idx_app_id_version_name_devices" ON "public"."devices" USING "btree" ("app_id", "version_name");



CREATE INDEX "idx_app_versions_created_at" ON "public"."app_versions" USING "btree" ("created_at");



CREATE INDEX "idx_app_versions_created_at_app_id" ON "public"."app_versions" USING "btree" ("created_at", "app_id");



CREATE INDEX "idx_app_versions_deleted" ON "public"."app_versions" USING "btree" ("deleted");



CREATE INDEX "idx_app_versions_deleted_at" ON "public"."app_versions" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_app_versions_id" ON "public"."app_versions" USING "btree" ("id");



CREATE INDEX "idx_app_versions_meta_id" ON "public"."app_versions_meta" USING "btree" ("id");



CREATE INDEX "idx_app_versions_name" ON "public"."app_versions" USING "btree" ("name");



CREATE INDEX "idx_app_versions_owner_org_not_deleted" ON "public"."app_versions" USING "btree" ("owner_org") WHERE ("deleted" = false);



CREATE INDEX "idx_app_versions_retention_cleanup" ON "public"."app_versions" USING "btree" ("deleted", "created_at", "app_id") WHERE ("deleted" = false);



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_operation" ON "public"."audit_logs" USING "btree" ("operation");



CREATE INDEX "idx_audit_logs_org_created" ON "public"."audit_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_org_id" ON "public"."audit_logs" USING "btree" ("org_id");



CREATE INDEX "idx_audit_logs_table_name" ON "public"."audit_logs" USING "btree" ("table_name");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_build_logs_org_created" ON "public"."build_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_build_logs_user_id" ON "public"."build_logs" USING "btree" ("user_id");



CREATE INDEX "idx_build_requests_app" ON "public"."build_requests" USING "btree" ("app_id");



CREATE INDEX "idx_build_requests_job" ON "public"."build_requests" USING "btree" ("builder_job_id");



CREATE INDEX "idx_build_requests_org" ON "public"."build_requests" USING "btree" ("owner_org");



CREATE INDEX "idx_build_requests_requested_by" ON "public"."build_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_capgo_credits_steps_org_id" ON "public"."capgo_credits_steps" USING "btree" ("org_id");



CREATE INDEX "idx_channels_app_id_name" ON "public"."channels" USING "btree" ("app_id", "name");



CREATE INDEX "idx_channels_app_id_version" ON "public"."channels" USING "btree" ("app_id", "version");



CREATE INDEX "idx_channels_public_app_id_android" ON "public"."channels" USING "btree" ("public", "app_id", "android");



CREATE INDEX "idx_channels_public_app_id_ios" ON "public"."channels" USING "btree" ("public", "app_id", "ios");



CREATE INDEX "idx_cron_tasks_enabled" ON "public"."cron_tasks" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_daily_build_time_app_date" ON "public"."daily_build_time" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_mau_app_id_date" ON "public"."daily_mau" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_version_app_id" ON "public"."daily_version" USING "btree" ("app_id");



CREATE INDEX "idx_daily_version_app_id_date" ON "public"."daily_version" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_version_version_name" ON "public"."daily_version" USING "btree" ("version_name");



CREATE INDEX "idx_deploy_history_created_by" ON "public"."deploy_history" USING "btree" ("created_by");



CREATE INDEX "idx_devices_default_channel" ON "public"."devices" USING "btree" ("default_channel");



CREATE INDEX "idx_devices_key_id" ON "public"."devices" USING "btree" ("key_id") WHERE ("key_id" IS NOT NULL);



CREATE INDEX "idx_id_app_id_app_versions_meta" ON "public"."app_versions_meta" USING "btree" ("id", "app_id");



CREATE INDEX "idx_manifest_app_version_id" ON "public"."manifest" USING "btree" ("app_version_id");



CREATE INDEX "idx_manifest_file_name_hash_version" ON "public"."manifest" USING "btree" ("file_name", "file_hash", "app_version_id");



CREATE INDEX "idx_orgs_customer_id" ON "public"."orgs" USING "btree" ("customer_id");



CREATE INDEX "idx_orgs_email_preferences" ON "public"."orgs" USING "gin" ("email_preferences");



CREATE INDEX "idx_stats_app_id_action" ON "public"."stats" USING "btree" ("app_id", "action");



CREATE INDEX "idx_stats_app_id_created_at" ON "public"."stats" USING "btree" ("app_id", "created_at");



CREATE INDEX "idx_stats_app_id_device_id" ON "public"."stats" USING "btree" ("app_id", "device_id");



CREATE INDEX "idx_stats_app_id_version_name" ON "public"."stats" USING "btree" ("app_id", "version_name");



CREATE INDEX "idx_stripe_info_customer_covering" ON "public"."stripe_info" USING "btree" ("customer_id") INCLUDE ("product_id", "subscription_anchor_start", "subscription_anchor_end");



CREATE INDEX "idx_stripe_info_trial" ON "public"."stripe_info" USING "btree" ("trial_at") WHERE ("trial_at" IS NOT NULL);



CREATE INDEX "idx_usage_credit_consumptions_grant" ON "public"."usage_credit_consumptions" USING "btree" ("grant_id", "applied_at" DESC);



CREATE INDEX "idx_usage_credit_consumptions_org_time" ON "public"."usage_credit_consumptions" USING "btree" ("org_id", "applied_at" DESC);



CREATE INDEX "idx_usage_credit_consumptions_overage_event_id" ON "public"."usage_credit_consumptions" USING "btree" ("overage_event_id");



CREATE INDEX "idx_usage_credit_grants_org_expires" ON "public"."usage_credit_grants" USING "btree" ("org_id", "expires_at");



CREATE INDEX "idx_usage_credit_grants_org_remaining" ON "public"."usage_credit_grants" USING "btree" ("org_id", (("credits_total" - "credits_consumed")));



CREATE INDEX "idx_usage_credit_transactions_grant" ON "public"."usage_credit_transactions" USING "btree" ("grant_id", "occurred_at" DESC);



CREATE INDEX "idx_usage_credit_transactions_org_time" ON "public"."usage_credit_transactions" USING "btree" ("org_id", "occurred_at" DESC);



CREATE INDEX "idx_usage_overage_events_credit_step_id" ON "public"."usage_overage_events" USING "btree" ("credit_step_id");



CREATE INDEX "idx_usage_overage_events_metric" ON "public"."usage_overage_events" USING "btree" ("metric");



CREATE INDEX "idx_usage_overage_events_org_time" ON "public"."usage_overage_events" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_user_password_compliance_user_org" ON "public"."user_password_compliance" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_users_email_preferences" ON "public"."users" USING "gin" ("email_preferences");



CREATE INDEX "idx_version_usage_version_name" ON "public"."version_usage" USING "btree" ("version_name");



CREATE INDEX "notifications_uniq_id_idx" ON "public"."notifications" USING "btree" ("uniq_id");



CREATE INDEX "org_users_app_id_idx" ON "public"."org_users" USING "btree" ("app_id");



CREATE UNIQUE INDEX "role_bindings_app_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "app_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_app"());



CREATE UNIQUE INDEX "role_bindings_bundle_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "bundle_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_bundle"());



CREATE UNIQUE INDEX "role_bindings_channel_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "channel_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_channel"());



CREATE UNIQUE INDEX "role_bindings_org_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "org_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_org"());



CREATE UNIQUE INDEX "role_bindings_platform_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_platform"());



CREATE INDEX "role_bindings_principal_scope_idx" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "scope_type", "org_id", "app_id", "channel_id");



CREATE INDEX "role_bindings_scope_idx" ON "public"."role_bindings" USING "btree" ("scope_type", "org_id", "app_id", "channel_id");



CREATE UNIQUE INDEX "si_customer_cover_uidx" ON "public"."stripe_info" USING "btree" ("customer_id") INCLUDE ("status", "trial_at", "mau_exceeded", "storage_exceeded", "bandwidth_exceeded");



CREATE INDEX "si_customer_status_trial_idx" ON "public"."stripe_info" USING "btree" ("customer_id", "status", "trial_at") INCLUDE ("mau_exceeded", "storage_exceeded", "bandwidth_exceeded");



CREATE INDEX "tmp_users_invite_magic_string_idx" ON "public"."tmp_users" USING "btree" ("invite_magic_string");



CREATE UNIQUE INDEX "tmp_users_org_id_email_idx" ON "public"."tmp_users" USING "btree" ("org_id", "email");



CREATE UNIQUE INDEX "to_delete_accounts_account_id_key" ON "public"."to_delete_accounts" USING "btree" ("account_id");



CREATE INDEX "to_delete_accounts_removal_date_idx" ON "public"."to_delete_accounts" USING "btree" ("removal_date");



CREATE UNIQUE INDEX "unique_app_version_negative" ON "public"."version_meta" USING "btree" ("app_id", "version_id") WHERE ("size" < 0);



CREATE UNIQUE INDEX "unique_app_version_positive" ON "public"."version_meta" USING "btree" ("app_id", "version_id") WHERE ("size" > 0);



CREATE UNIQUE INDEX "usage_credit_transactions_purchase_payment_intent_id_idx" ON "public"."usage_credit_transactions" USING "btree" ((("source_ref" ->> 'paymentIntentId'::"text"))) WHERE (("transaction_type" = 'purchase'::"public"."credit_transaction_type") AND (("source_ref" ->> 'paymentIntentId'::"text") IS NOT NULL));



CREATE UNIQUE INDEX "usage_credit_transactions_purchase_session_id_idx" ON "public"."usage_credit_transactions" USING "btree" ((("source_ref" ->> 'sessionId'::"text"))) WHERE (("transaction_type" = 'purchase'::"public"."credit_transaction_type") AND (("source_ref" ->> 'sessionId'::"text") IS NOT NULL));



CREATE INDEX "webhook_deliveries_org_id_created_idx" ON "public"."webhook_deliveries" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "webhook_deliveries_pending_retry_idx" ON "public"."webhook_deliveries" USING "btree" ("status", "next_retry_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "public"."webhook_deliveries" USING "btree" ("webhook_id");



CREATE INDEX "webhooks_enabled_idx" ON "public"."webhooks" USING "btree" ("org_id", "enabled") WHERE ("enabled" = true);



CREATE INDEX "webhooks_org_id_idx" ON "public"."webhooks" USING "btree" ("org_id");



CREATE OR REPLACE TRIGGER "audit_app_versions_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_apps_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_channels_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_org_users_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_orgs_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "channel_device_count_enqueue" AFTER INSERT OR DELETE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_channel_device_counts"();



CREATE OR REPLACE TRIGGER "check_if_org_can_exist_org_users" AFTER DELETE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_if_org_can_exist"();



CREATE OR REPLACE TRIGGER "check_privileges" BEFORE INSERT OR UPDATE OF "user_id", "org_id", "user_right" ON "public"."org_users" FOR EACH ROW WHEN ((("current_setting"('"request.jwt.claim.role"'::"text", true) = 'authenticated'::"text") AND (NOT ("current_setting"('"request.jwt.claim.email"'::"text", true) = ANY (ARRAY['bot@capgo.app'::"text", 'test@capgo.app'::"text"]))))) EXECUTE FUNCTION "public"."check_org_user_privileges"();



CREATE OR REPLACE TRIGGER "credit_usage_alert_on_transactions" AFTER INSERT ON "public"."usage_credit_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_credit_usage_alert"();



CREATE OR REPLACE TRIGGER "enforce_encrypted_bundle_trigger" BEFORE INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."check_encrypted_bundle_on_insert"();



CREATE OR REPLACE TRIGGER "force_valid_apikey_name" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."auto_apikey_name_by_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions" BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions_meta" BEFORE INSERT OR UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channel_devices" BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channels" BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "generate_org_on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_on_user_create"();



CREATE OR REPLACE TRIGGER "generate_org_user_stripe_info_on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"();



CREATE OR REPLACE TRIGGER "handle_build_requests_updated_at" BEFORE UPDATE ON "public"."build_requests" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_apps_text_fields"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."capgo_credits_steps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."tmp_users" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_tmp_users_text_fields"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_users_text_fields"();



CREATE OR REPLACE TRIGGER "noupdate" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."noupdate"();



CREATE OR REPLACE TRIGGER "on_app_create" AFTER INSERT ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_create');



CREATE OR REPLACE TRIGGER "on_app_delete" AFTER DELETE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_delete');



CREATE OR REPLACE TRIGGER "on_audit_log_webhook" AFTER INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_webhook_on_audit_log"();



CREATE OR REPLACE TRIGGER "on_channel_update" AFTER UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_channel_update');



CREATE OR REPLACE TRIGGER "on_manifest_create" AFTER INSERT ON "public"."manifest" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_manifest_create');



CREATE OR REPLACE TRIGGER "on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_create');



CREATE OR REPLACE TRIGGER "on_organization_delete" AFTER DELETE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_delete');



CREATE OR REPLACE TRIGGER "on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_create');



CREATE OR REPLACE TRIGGER "on_user_delete" AFTER DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_delete');



CREATE OR REPLACE TRIGGER "on_user_update" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_update');



CREATE OR REPLACE TRIGGER "on_version_create" AFTER INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_create');



CREATE OR REPLACE TRIGGER "on_version_delete" AFTER DELETE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_delete');



CREATE OR REPLACE TRIGGER "on_version_update" AFTER UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_update');



CREATE OR REPLACE TRIGGER "record_deployment_history_trigger" AFTER UPDATE OF "version" ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."record_deployment_history"();



CREATE OR REPLACE TRIGGER "replicate_devices" AFTER INSERT OR DELETE OR UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('replicate_data', 'cloudflare');



CREATE OR REPLACE TRIGGER "sanitize_orgs_text_fields" BEFORE INSERT OR UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_orgs_text_fields"();



CREATE OR REPLACE TRIGGER "set_deleted_at_trigger" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."set_deleted_at_on_soft_delete"();



CREATE OR REPLACE TRIGGER "sync_org_user_role_binding_on_update" AFTER UPDATE OF "user_right" ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_org_user_role_binding_on_update"();



COMMENT ON TRIGGER "sync_org_user_role_binding_on_update" ON "public"."org_users" IS 'Ensures role_bindings are updated automatically when org_users permissions are changed.';



CREATE OR REPLACE TRIGGER "sync_org_user_to_role_binding_on_insert" AFTER INSERT ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_org_user_to_role_binding"();



COMMENT ON TRIGGER "sync_org_user_to_role_binding_on_insert" ON "public"."org_users" IS 'Ensures role_bindings are created automatically when org_users entries are added.';



CREATE OR REPLACE TRIGGER "update_webhooks_updated_at" BEFORE UPDATE ON "public"."webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_webhook_updated_at"();



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_metrics_cache"
    ADD CONSTRAINT "app_metrics_cache_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_owner_org_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capgo_credits_steps"
    ADD CONSTRAINT "capgo_credits_steps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_build_time"
    ADD CONSTRAINT "daily_build_time_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manifest"
    ADD CONSTRAINT "manifest_app_version_id_fkey" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("rbac_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_child_role_id_fkey" FOREIGN KEY ("child_role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans"("stripe_id");



ALTER TABLE ONLY "public"."tmp_users"
    ADD CONSTRAINT "tmp_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."to_delete_accounts"
    ADD CONSTRAINT "to_delete_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."usage_credit_grants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_overage_event_id_fkey" FOREIGN KEY ("overage_event_id") REFERENCES "public"."usage_overage_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_credit_grants"
    ADD CONSTRAINT "usage_credit_grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."usage_credit_grants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_credit_step_id_fkey" FOREIGN KEY ("credit_step_id") REFERENCES "public"."capgo_credits_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



CREATE POLICY " allow anon to select" ON "public"."global_stats" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow admin to delete webhooks" ON "public"."webhooks" FOR DELETE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to insert webhook_deliveries" ON "public"."webhook_deliveries" FOR INSERT TO "anon", "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to insert webhooks" ON "public"."webhooks" FOR INSERT TO "anon", "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to update webhook_deliveries" ON "public"."webhook_deliveries" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to update webhooks" ON "public"."webhooks" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."app_versions" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."apps" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow apikey to read" ON "public"."stats" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"(( SELECT "public"."get_apikey_header"() AS "get_apikey_header"), '{all,write}'::"public"."key_mode"[], "app_id"));



CREATE POLICY "Allow delete for auth (admin+) (all apikey)" ON "public"."channels" FOR DELETE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow delete for auth, api keys (write+)" ON "public"."channel_devices" FOR DELETE TO "anon", "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" FOR INSERT TO "anon", "authenticated" WITH CHECK (( SELECT "public"."check_min_rights"('write'::"public"."user_min_right", ( SELECT "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "apps"."owner_org", "apps"."app_id") AS "get_identity_org_appid"), "apps"."owner_org", "apps"."app_id", NULL::bigint) AS "check_min_rights"));



CREATE POLICY "Allow insert for auth (write+)" ON "public"."channel_devices" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels" FOR INSERT TO "anon", "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow insert org for apikey or user" ON "public"."orgs" FOR INSERT TO "anon", "authenticated" WITH CHECK (("created_by" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")));



CREATE POLICY "Allow member and owner to select" ON "public"."org_users" FOR SELECT TO "anon", "authenticated" USING ("public"."is_member_of_org"(( SELECT "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"), "org_id"));



CREATE POLICY "Allow org admin to insert" ON "public"."org_users" FOR INSERT TO "anon", "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org admin to update" ON "public"."org_users" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org delete for super_admin" ON "public"."orgs" FOR DELETE TO "anon", "authenticated" USING (( SELECT "public"."check_min_rights"('super_admin'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "orgs"."id") AS "get_identity_org_allowed"), "orgs"."id", NULL::character varying, NULL::bigint) AS "check_min_rights"));



CREATE POLICY "Allow org member to insert devices" ON "public"."devices" FOR INSERT TO "anon", "authenticated" WITH CHECK (( SELECT "public"."check_min_rights"('write'::"public"."user_min_right", ( SELECT "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id") AS "get_identity_org_appid"), ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id", NULL::bigint) AS "check_min_rights"));



CREATE POLICY "Allow org member to select devices" ON "public"."devices" FOR SELECT TO "anon", "authenticated" USING (( SELECT "public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id") AS "get_identity_org_appid"), ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id", NULL::bigint) AS "check_min_rights"));



CREATE POLICY "Allow org member to select stripe_info" ON "public"."stripe_info" FOR SELECT TO "anon", "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orgs" "o"
  WHERE ((("o"."customer_id")::"text" = ("stripe_info"."customer_id")::"text") AND ( SELECT "public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "o"."id") AS "get_identity_org_allowed"), "o"."id", NULL::character varying, NULL::bigint) AS "check_min_rights")))));



CREATE POLICY "Allow org member to update devices" ON "public"."devices" FOR UPDATE TO "anon", "authenticated" USING (( SELECT "public"."check_min_rights"('write'::"public"."user_min_right", ( SELECT "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text"), "devices"."app_id") AS "get_identity_org_appid"), ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id", NULL::bigint) AS "check_min_rights")) WITH CHECK (( SELECT "public"."check_min_rights"('write'::"public"."user_min_right", ( SELECT "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text"), "devices"."app_id") AS "get_identity_org_appid"), ( SELECT "public"."get_user_main_org_id_by_app_id"(("devices"."app_id")::"text") AS "get_user_main_org_id_by_app_id"), "devices"."app_id", NULL::bigint) AS "check_min_rights"));



CREATE POLICY "Allow org members to select build_logs" ON "public"."build_logs" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select build_requests" ON "public"."build_requests" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow org members to select daily_build_time" ON "public"."daily_build_time" FOR SELECT TO "anon", "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_build_time"."app_id")::"text") AND "public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "apps"."owner_org", "apps"."app_id"), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow org members to select usage_credit_consumptions" ON "public"."usage_credit_consumptions" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select usage_credit_grants" ON "public"."usage_credit_grants" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select usage_credit_transactions" ON "public"."usage_credit_transactions" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select usage_overage_events" ON "public"."usage_overage_events" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select webhook_deliveries" ON "public"."webhook_deliveries" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select webhooks" ON "public"."webhooks" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow owner to delete own apikeys" ON "public"."apikeys" FOR DELETE TO "anon", "authenticated" USING (("user_id" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")));



CREATE POLICY "Allow owner to insert own apikeys" ON "public"."apikeys" FOR INSERT TO "anon", "authenticated" WITH CHECK (("user_id" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")));



CREATE POLICY "Allow owner to insert own users" ON "public"."users" FOR INSERT TO "anon", "authenticated" WITH CHECK ((("id" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow owner to select own apikeys" ON "public"."apikeys" FOR SELECT TO "anon", "authenticated" USING (("user_id" = ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity")));



CREATE POLICY "Allow owner to select own user" ON "public"."users" FOR SELECT TO "anon", "authenticated" USING ((("id" = ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow owner to update own apikeys" ON "public"."apikeys" FOR UPDATE TO "anon", "authenticated" USING (("user_id" = ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity"))) WITH CHECK (("user_id" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")));



CREATE POLICY "Allow owner to update own users" ON "public"."users" FOR UPDATE TO "anon", "authenticated" USING ((("id" = ( SELECT "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]) AS "get_identity")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted"))) WITH CHECK ((("id" = ( SELECT "public"."get_identity"('{write,all}'::"public"."key_mode"[]) AS "get_identity")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow read for auth (read+)" ON "public"."channel_devices" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_bandwidth" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));



CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_mau" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));



CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_storage" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));



CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_version" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));



CREATE POLICY "Allow read for auth (read+)" ON "public"."stats" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));



CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_appid"('{read,upload,write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs" FOR SELECT TO "anon", "authenticated" USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_consumptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_grants" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_transactions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_overage_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access to webhook_deliveries" ON "public"."webhook_deliveries" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access to webhooks" ON "public"."webhooks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "anon", "authenticated" USING (("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity_org_allowed"('{all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"), "org_id", NULL::character varying, NULL::bigint) OR ("user_id" = ( SELECT "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_users"."org_id") AS "get_identity_org_allowed"))));



CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR UPDATE TO "anon" USING ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"), "id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all,upload}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow update for auth, api keys (write+)" ON "public"."channel_devices" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow update for auth, api keys (write, all) (write+)" ON "public"."channels" FOR UPDATE TO "anon", "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity_org_appid"('{write,all}'::"public"."key_mode"[], "owner_org", "app_id"), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow users to delete manifest entries" ON "public"."manifest" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."app_versions" "av"
     JOIN "public"."apps" "a" ON ((("av"."app_id")::"text" = ("a"."app_id")::"text")))
  WHERE (("av"."id" = "manifest"."app_version_id") AND ("a"."owner_org" IN ( SELECT "o"."id"
           FROM "public"."orgs" "o"
          WHERE ("o"."id" IN ( SELECT "ou"."org_id"
                   FROM "public"."org_users" "ou"
                  WHERE ("ou"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));



CREATE POLICY "Allow users to insert manifest entries" ON "public"."manifest" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."app_versions" "av"
     JOIN "public"."apps" "a" ON ((("av"."app_id")::"text" = ("a"."app_id")::"text")))
  WHERE (("av"."id" = "manifest"."app_version_id") AND ("a"."owner_org" IN ( SELECT "o"."id"
           FROM "public"."orgs" "o"
          WHERE ("o"."id" IN ( SELECT "ou"."org_id"
                   FROM "public"."org_users" "ou"
                  WHERE ("ou"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))))));



CREATE POLICY "Allow users to read any manifest entry" ON "public"."manifest" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow users to view deploy history for their org" ON "public"."deploy_history" FOR SELECT TO "authenticated" USING (( SELECT (( SELECT "auth"."uid"() AS "uid") IN ( SELECT "org_users"."user_id"
           FROM "public"."org_users"
          WHERE ("org_users"."org_id" = "deploy_history"."owner_org")))));



CREATE POLICY "Allow users with write permissions to insert deploy history" ON "public"."deploy_history" FOR INSERT WITH CHECK (false);



CREATE POLICY "Anyone can read capgo_credits_steps" ON "public"."capgo_credits_steps" FOR SELECT USING (true);



CREATE POLICY "Deny all" ON "public"."app_metrics_cache" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."cron_tasks" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."to_delete_accounts" USING (false) WITH CHECK (false);



CREATE POLICY "Deny delete on deploy history" ON "public"."deploy_history" FOR DELETE USING (false);



CREATE POLICY "Disable for all" ON "public"."bandwidth_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."device_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."notifications" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."storage_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."tmp_users" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."version_meta" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."version_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow owner to delete own users" ON "public"."users" FOR DELETE TO "anon", "authenticated" USING (false);



CREATE POLICY "Enable select for authenticated users only" ON "public"."plans" FOR SELECT TO "anon", "authenticated" USING (true);



CREATE POLICY "Enable update for users based on email" ON "public"."deleted_account" FOR INSERT TO "authenticated" WITH CHECK (("encode"("extensions"."digest"(( SELECT "auth"."email"() AS "email"), 'sha256'::"text"), 'hex'::"text") = ("email")::"text"));



CREATE POLICY "Prevent non 2FA access" ON "public"."apikeys" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."app_versions" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."apps" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."channel_devices" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."channels" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."org_users" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."orgs" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent update on deploy history" ON "public"."deploy_history" FOR UPDATE USING (false) WITH CHECK (false);



CREATE POLICY "Prevent users from updating manifest entries" ON "public"."manifest" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Service role manages build logs" ON "public"."build_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages build requests" ON "public"."build_requests" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages build time" ON "public"."daily_build_time" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can read own password compliance" ON "public"."user_password_compliance" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."apikeys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_metrics_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_versions_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bandwidth_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."capgo_credits_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_bandwidth" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_build_time" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_mau" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_storage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_version" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deleted_account" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deleted_apps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_all_access" ON "public"."deleted_apps" USING (false) WITH CHECK (false);



ALTER TABLE "public"."deploy_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_delete" ON "public"."group_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND ("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "groups"."org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))))));



COMMENT ON POLICY "group_members_delete" ON "public"."group_members" IS 'Org admins and platform admins can delete group_members.';



CREATE POLICY "group_members_insert" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND ("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "groups"."org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))))));



COMMENT ON POLICY "group_members_insert" ON "public"."group_members" IS 'Org admins and platform admins can insert group_members.';



CREATE POLICY "group_members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."groups"
     JOIN "public"."org_users" ON (("org_users"."org_id" = "groups"."org_id")))
  WHERE (("groups"."id" = "group_members"."group_id") AND ("org_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "group_members_select" ON "public"."group_members" IS 'Org members and platform admins can read group_members. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "group_members_update" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND ("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "groups"."org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND ("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "groups"."org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))))));



COMMENT ON POLICY "group_members_update" ON "public"."group_members" IS 'Org admins and platform admins can update group_members.';



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_delete" ON "public"."groups" FOR DELETE TO "authenticated" USING (("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "groups_delete" ON "public"."groups" IS 'Org admins and platform admins can delete groups.';



CREATE POLICY "groups_insert" ON "public"."groups" FOR INSERT TO "authenticated" WITH CHECK (("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "groups_insert" ON "public"."groups" IS 'Org admins and platform admins can insert groups.';



CREATE POLICY "groups_select" ON "public"."groups" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."org_users"
  WHERE (("org_users"."org_id" = "groups"."org_id") AND ("org_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "groups_select" ON "public"."groups" IS 'Org members and platform admins can read groups. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "groups_update" ON "public"."groups" FOR UPDATE TO "authenticated" USING (("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "groups_update" ON "public"."groups" IS 'Org admins and platform admins can update groups.';



ALTER TABLE "public"."manifest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_delete" ON "public"."permissions" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "permissions_delete" ON "public"."permissions" IS 'Only platform admins can delete permissions.';



CREATE POLICY "permissions_insert" ON "public"."permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "permissions_insert" ON "public"."permissions" IS 'Only platform admins can insert permissions.';



CREATE POLICY "permissions_select" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "permissions_select" ON "public"."permissions" IS 'All authenticated users can read permissions. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "permissions_update" ON "public"."permissions" FOR UPDATE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "permissions_update" ON "public"."permissions" IS 'Only platform admins can update permissions.';



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rbac_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rbac_settings_delete" ON "public"."rbac_settings" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "rbac_settings_delete" ON "public"."rbac_settings" IS 'Only platform admins can delete RBAC settings.';



CREATE POLICY "rbac_settings_insert" ON "public"."rbac_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "rbac_settings_insert" ON "public"."rbac_settings" IS 'Only platform admins can insert RBAC settings.';



CREATE POLICY "rbac_settings_select" ON "public"."rbac_settings" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "rbac_settings_select" ON "public"."rbac_settings" IS 'All authenticated users can read RBAC settings. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "rbac_settings_update" ON "public"."rbac_settings" FOR UPDATE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "rbac_settings_update" ON "public"."rbac_settings" IS 'Only platform admins can update RBAC settings.';



ALTER TABLE "public"."role_bindings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_bindings_delete" ON "public"."role_bindings" FOR DELETE TO "authenticated" USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (("scope_type" = "public"."rbac_scope_org"()) AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("apps"."app_id")::"text" = ("channels"."app_id")::"text")))
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "channels"."app_id", "channels"."id"))))) OR (("scope_type" = "public"."rbac_scope_app"()) AND "public"."user_has_app_update_user_roles"(( SELECT "auth"."uid"() AS "uid"), "app_id")) OR (("scope_type" = "public"."rbac_scope_app"()) AND ("principal_type" = "public"."rbac_principal_user"()) AND ("principal_id" = ( SELECT "auth"."uid"() AS "uid")))));



COMMENT ON POLICY "role_bindings_delete" ON "public"."role_bindings" IS 'Consolidated DELETE policy for role_bindings. Scope admins, users with update_user_roles permission, and users deleting their own bindings. Single DELETE policy to avoid multiple permissive policies.';



CREATE POLICY "role_bindings_insert" ON "public"."role_bindings" FOR INSERT TO "authenticated" WITH CHECK (((("scope_type" = "public"."rbac_scope_platform"()) AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) OR (("scope_type" = "public"."rbac_scope_org"()) AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("apps"."app_id")::"text" = ("channels"."app_id")::"text")))
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "channels"."app_id", "channels"."id"))))) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "role_bindings_insert" ON "public"."role_bindings" IS 'Scope admins can insert role_bindings within their scope.';



CREATE POLICY "role_bindings_select" ON "public"."role_bindings" FOR SELECT TO "authenticated" USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR "public"."is_user_org_admin"(( SELECT "auth"."uid"() AS "uid"), "org_id") OR (("scope_type" = "public"."rbac_scope_app"()) AND "public"."is_user_app_admin"(( SELECT "auth"."uid"() AS "uid"), "app_id")) OR (("scope_type" = "public"."rbac_scope_app"()) AND ("app_id" IS NOT NULL) AND "public"."user_has_role_in_app"(( SELECT "auth"."uid"() AS "uid"), "app_id")) OR (("scope_type" = "public"."rbac_scope_channel"()) AND ("channel_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."channels" "c"
     JOIN "public"."apps" "a" ON ((("a"."app_id")::"text" = ("c"."app_id")::"text")))
  WHERE (("c"."rbac_id" = "role_bindings"."channel_id") AND "public"."is_user_app_admin"(( SELECT "auth"."uid"() AS "uid"), "a"."id")))))));



COMMENT ON POLICY "role_bindings_select" ON "public"."role_bindings" IS 'Consolidated SELECT policy for role_bindings. Visible to platform admins, org admins, app admins, and users with roles. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "role_bindings_update" ON "public"."role_bindings" FOR UPDATE TO "authenticated" USING (((("scope_type" = "public"."rbac_scope_platform"()) AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) OR (("scope_type" = "public"."rbac_scope_org"()) AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("apps"."app_id")::"text" = ("channels"."app_id")::"text")))
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "channels"."app_id", "channels"."id"))))) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((("scope_type" = "public"."rbac_scope_platform"()) AND "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) OR (("scope_type" = "public"."rbac_scope_org"()) AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("apps"."app_id")::"text" = ("channels"."app_id")::"text")))
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), ( SELECT "auth"."uid"() AS "uid"), "apps"."owner_org", "channels"."app_id", "channels"."id"))))) OR "public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "role_bindings_update" ON "public"."role_bindings" IS 'Scope admins can update role_bindings within their scope.';



ALTER TABLE "public"."role_hierarchy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_hierarchy_delete" ON "public"."role_hierarchy" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_hierarchy_delete" ON "public"."role_hierarchy" IS 'Only platform admins can delete role_hierarchy.';



CREATE POLICY "role_hierarchy_insert" ON "public"."role_hierarchy" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_hierarchy_insert" ON "public"."role_hierarchy" IS 'Only platform admins can insert role_hierarchy.';



CREATE POLICY "role_hierarchy_select" ON "public"."role_hierarchy" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "role_hierarchy_select" ON "public"."role_hierarchy" IS 'All authenticated users can read role_hierarchy. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "role_hierarchy_update" ON "public"."role_hierarchy" FOR UPDATE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_hierarchy_update" ON "public"."role_hierarchy" IS 'Only platform admins can update role_hierarchy.';



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_delete" ON "public"."role_permissions" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_permissions_delete" ON "public"."role_permissions" IS 'Only platform admins can delete role_permissions.';



CREATE POLICY "role_permissions_insert" ON "public"."role_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_permissions_insert" ON "public"."role_permissions" IS 'Only platform admins can insert role_permissions.';



CREATE POLICY "role_permissions_select" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "role_permissions_select" ON "public"."role_permissions" IS 'All authenticated users can read role_permissions. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "role_permissions_update" ON "public"."role_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "role_permissions_update" ON "public"."role_permissions" IS 'Only platform admins can update role_permissions.';



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_delete" ON "public"."roles" FOR DELETE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "roles_delete" ON "public"."roles" IS 'Only platform admins can delete roles.';



CREATE POLICY "roles_insert" ON "public"."roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "roles_insert" ON "public"."roles" IS 'Only platform admins can insert roles.';



CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "roles_select" ON "public"."roles" IS 'All authenticated users can read roles. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "roles_update" ON "public"."roles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



COMMENT ON POLICY "roles_update" ON "public"."roles" IS 'Only platform admins can update roles.';



ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tmp_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."to_delete_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_consumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_overage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_password_compliance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."version_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."version_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;


CREATE PUBLICATION "planetscale_replicate" WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION "planetscale_replicate" OWNER TO "postgres";




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."app_versions";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."apps";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."channel_devices";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."channels";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."manifest";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."org_users";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."orgs";



ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY "public"."stripe_info";






REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
























































































































































































































































































































GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";



GRANT ALL ON FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights_legacy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_min_rights_legacy_no_password_policy"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apikeys" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apikeys" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apikeys" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_old_channel_devices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "anon";
GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_all_onboarded"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_all_plans_v2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_plans_v2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_old_deleted_versions"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_old_deleted_versions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_old_deleted_versions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "service_role";









REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."generate_org_on_user_create"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_removal_date"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_account_removal_date"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_apikey"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_apikey"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_org_allowed"("keymode" "public"."key_mode"[], "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_orgs_v7"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v7"("userid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "service_role";



GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "anon";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_free_trial_expired"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_subscribed_orgs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscribed_orgs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_org_role"("p_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_legacy_role_hint"("p_user_right" "public"."user_min_right", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_permission_for_legacy"("p_min_right" "public"."user_min_right", "p_scope" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_preview_migration"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_invite_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_invite_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_invite_upload"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_upload"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_upload"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_invite_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_invite_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_upload"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_upload"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_upload"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_right_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_right_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_right_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_apps_text_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_apps_text_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_apps_text_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_orgs_text_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_orgs_text_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_orgs_text_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_tmp_users_text_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_tmp_users_text_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_tmp_users_text_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_users_text_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_users_text_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_users_text_fields"() TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_org_user_role_binding_on_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_org_user_role_binding_on_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_org_user_role_binding_on_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_org_user_to_role_binding"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_org_user_to_role_binding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_org_user_to_role_binding"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."total_bundle_storage_bytes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."transform_role_to_invite"("role_input" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."transform_role_to_invite"("role_input" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transform_role_to_invite"("role_input" "public"."user_min_right") TO "service_role";



GRANT ALL ON FUNCTION "public"."transform_role_to_non_invite"("role_input" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."transform_role_to_non_invite"("role_input" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transform_role_to_non_invite"("role_input" "public"."user_min_right") TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."update_app_versions_retention"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_app_versions_retention"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "service_role";
























GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions_meta" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions_meta" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions_meta" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apps" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apps" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."apps" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."bandwidth_usage" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."bandwidth_usage" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."bandwidth_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."build_logs" TO "anon";
GRANT ALL ON TABLE "public"."build_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."build_logs" TO "service_role";



GRANT ALL ON TABLE "public"."build_requests" TO "anon";
GRANT ALL ON TABLE "public"."build_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."build_requests" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."capgo_credits_steps" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."capgo_credits_steps" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."capgo_credits_steps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channel_devices" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channel_devices" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channel_devices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channels" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channels" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."channels" TO "service_role";



GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."cron_tasks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."cron_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_bandwidth" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_bandwidth" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_bandwidth" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_build_time" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_build_time" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_build_time" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_mau" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_mau" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_mau" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_storage" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_storage" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_storage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_version" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_version" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_version" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_account" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_account" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_account" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_apps" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_apps" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deleted_apps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deploy_history" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deploy_history" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."deploy_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."device_usage" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."device_usage" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."device_usage" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."devices" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."devices" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."devices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."devices_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."devices_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devices_usage_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."global_stats" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."global_stats" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."global_stats" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_members" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_members" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."groups" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."groups" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."groups" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."manifest" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."manifest" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."manifest" TO "service_role";



GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_users" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."org_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."orgs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."orgs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."orgs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."permissions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."permissions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."permissions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rbac_settings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rbac_settings" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rbac_settings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_bindings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_bindings" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_bindings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_hierarchy" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_hierarchy" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_hierarchy" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_permissions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_permissions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."role_permissions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."roles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."roles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."roles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stats" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stats" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."storage_usage" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."storage_usage" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."storage_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stripe_info" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stripe_info" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."stripe_info" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tmp_users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tmp_users" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tmp_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."to_delete_accounts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."to_delete_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."to_delete_accounts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_grants" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_grants" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_grants" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_balances" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_balances" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_balances" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_consumptions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_consumptions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_consumptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_transactions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_transactions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_transactions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_overage_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_overage_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_overage_events" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_ledger" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_ledger" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."usage_credit_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_password_compliance" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_password_compliance" TO "authenticated";
GRANT ALL ON TABLE "public"."user_password_compliance" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."users" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."users" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_meta" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_meta" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_meta" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_usage" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_usage" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."version_usage" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks" TO "anon";
GRANT ALL ON TABLE "public"."webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "service_role";




























