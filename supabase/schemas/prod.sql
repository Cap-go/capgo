


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
    'android'
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
    'disableDevice'
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
Declare  
 invite record;
Begin
  SELECT org_users.* FROM public.org_users
  INTO invite
  WHERE org_users.org_id=accept_invitation_to_org.org_id and (select auth.uid())=org_users.user_id;

  IF invite IS NULL THEN
    return 'NO_INVITE';
  else
    IF NOT (invite.user_right::varchar ilike 'invite_'||'%') THEN
      return 'INVALID_ROLE';
    END IF;

    UPDATE public.org_users
    SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::"public"."user_min_right"
    WHERE org_users.id=invite.id;

    return 'OK';
  end if;
End;
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
    AS $$BEGIN

  IF (NEW.name IS NOT DISTINCT FROM NULL) OR LENGTH(NEW.name) = 0 THEN
    NEW.name = format('Apikey %s', NEW.id);
  END IF;

  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."auto_apikey_name_by_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$BEGIN
  IF NEW."app_id" is distinct from OLD."app_id" AND OLD."app_id" is distinct from NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = public.get_user_main_org_id_by_app_id(NEW."app_id");

   RETURN NEW;
END;$$;


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


CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  delete FROM public.orgs
  where
  (
      (
      select
          count(*)
      from
          public.org_users
      where
          org_users.user_right = 'super_admin'
          AND org_users.user_id != OLD.user_id
          AND org_users.org_id=orgs.id
      ) = 0
  ) 
  AND orgs.id=OLD.org_id;

  RETURN OLD;
END;$$;


ALTER FUNCTION "public"."check_if_org_can_exist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := public.check_min_rights(min_right, (select auth.uid()), org_id, app_id, channel_id);
  RETURN allowed;
END;
$$;


ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    user_right_record RECORD;
    org_enforcing_2fa boolean;
BEGIN
    IF user_id IS NULL THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = check_min_rights.org_id;

    -- If org enforces 2FA and user doesn't have 2FA enabled, deny access
    IF org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
        RETURN false;
    END IF;

    -- Check password policy enforcement
    IF NOT public.user_meets_password_policy(user_id, org_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_PASSWORD_POLICY_ENFORCEMENT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
        RETURN false;
    END IF;

    FOR user_right_record IN
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id
        FROM public.org_users
        WHERE org_users.org_id = check_min_rights.org_id AND org_users.user_id = check_min_rights.user_id
    LOOP
        IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id = check_min_rights.channel_id)
        THEN
            RETURN true;
        END IF;
    END LOOP;

    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";

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
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."apikeys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apikeys"."key_hash" IS 'SHA-256 hash of the API key. When set, the key column is cleared to null for security.';



COMMENT ON COLUMN "public"."apikeys"."expires_at" IS 'When this API key expires. NULL means never expires.';



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
    AS $$BEGIN

  -- here we check if the user is a service role in order to bypass this permission check
  IF (((SELECT auth.jwt() ->> 'role')='service_role') OR ((select current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;

  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
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
END;$$;


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


CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE job_pid IN (
        SELECT jobid 
        FROM cron.job 
        WHERE schedule = '5 seconds' OR schedule = '1 seconds' OR schedule = '10 seconds'
    ) 
    AND end_time < now() - interval '1 hour';
END;
$$;


ALTER FUNCTION "public"."cleanup_frequent_job_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_job_run_details_7days"() RETURNS "void"
    LANGUAGE "plpgsql"
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
Begin
  RETURN bytes_value / 1024.0 / 1024.0;
End;
$$;


ALTER FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
Begin
  RETURN gb * 1024 * 1024 * 1024;
End;
$$;


ALTER FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
Begin
  RETURN gb * 1024 * 1024;
End;
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
Begin
  RETURN (SELECT COUNT(*) FROM public.stripe_info WHERE is_good_plan = false AND status = 'succeeded');
End;  
$$;


ALTER FUNCTION "public"."count_all_need_upgrade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_onboarded"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT COUNT(DISTINCT owner_org) FROM public.apps);
End;  
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
    AND si.status is NULL
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


CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
  old_record_json jsonb;
BEGIN
  -- Get the current user ID and email
  SELECT "auth"."uid"() INTO user_id_fn;
  SELECT "email" INTO user_email FROM "auth"."users" WHERE "id" = user_id_fn;
  
  -- Fetch the old_record using the specified query format
  SELECT row_to_json(u)::jsonb INTO old_record_json
  FROM (
    SELECT *
    FROM public.users
    WHERE id = user_id_fn
  ) AS u;
  
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
    "jsonb_build_object"('email', user_email, 'apikeys', (SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn))
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
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid));
End;  
$$;


ALTER FUNCTION "public"."exist_app_v2"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version));
End;  
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
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  found_key public.apikeys%ROWTYPE;
BEGIN
  -- First try plain-text lookup
  SELECT * INTO found_key FROM public.apikeys WHERE key = key_value LIMIT 1;
  IF FOUND THEN
    RETURN NEXT found_key;
    RETURN;
  END IF;

  -- Try hashed lookup
  SELECT * INTO found_key FROM public.apikeys
  WHERE key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  LIMIT 1;
  IF FOUND THEN
    RETURN NEXT found_key;
    RETURN;
  END IF;

  -- No key found
  RETURN;
END;
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
    AS $$BEGIN
  NEW.user_id = (select created_by FROM public.orgs where id = (NEW."owner_org"));

   RETURN NEW;
END;$$;


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
  org_record record;
BEGIN
    INSERT INTO public.org_users (user_id, org_id, user_right) values (NEW.created_by, NEW.id, 'super_admin'::"public"."user_min_right");
    RETURN NEW;
END $$;


ALTER FUNCTION "public"."generate_org_user_on_org_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_removal_date"("user_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    removal_date TIMESTAMPTZ;
BEGIN
    -- Get the removal_date for the user_id
    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts 
    WHERE account_id = user_id;
    
    -- Throw exception if account is not in the table
    IF removal_date IS NULL THEN
        RAISE EXCEPTION 'Account with ID % is not marked for deletion', user_id;
    END IF;
    
    RETURN removal_date;
END;
$$;


ALTER FUNCTION "public"."get_account_removal_date"("user_id" "uuid") OWNER TO "postgres";


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
Begin
  RETURN (SELECT id
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(select public.get_user_main_org_id_by_app_id(appid))
  AND public.is_member_of_org(public.get_user_id(apikey), (SELECT public.get_user_main_org_id_by_app_id(appid)))
  );
End;  
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
Begin
  RETURN 
  (SELECT name
  FROM public.plans
    WHERE stripe_id=(SELECT product_id
    FROM public.stripe_info
    where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
    ));
End;  
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
Begin
  SELECT auth.uid() into auth_uid;

  -- JWT auth.uid is not null, return
  IF auth_uid IS NOT NULL THEN
    return auth_uid;
  END IF;

  -- JWT is null
  RETURN NULL;
End;
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
Begin
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
End;
$$;


ALTER FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
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
End;
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
Begin
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
End;
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
Begin
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
End;
$$;


ALTER FUNCTION "public"."get_identity_org_appid"("keymode" "public"."key_mode"[], "org_id" "uuid", "app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") RETURNS TABLE("org_name" "text", "org_logo" "text", "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    o.name AS org_name,
    o.logo AS org_logo,
    tmp.role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
  AND tmp.cancelled_at IS NULL
  AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_metered_usage"() RETURNS "public"."stats_table"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.get_metered_usage((select auth.uid()));
END;  
$$;


ALTER FUNCTION "public"."get_metered_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_metered_usage"("orgid" "uuid") RETURNS "public"."stats_table"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  current_usage public.stats_table;
  max_plan public.stats_table;
  result public.stats_table;
BEGIN
  SELECT mau, bandwidth, storage INTO current_usage FROM public.get_total_metrics(orgid);
  SELECT mau, bandwidth, storage INTO max_plan FROM public.get_current_plan_max_org(orgid);
  result.mau := GREATEST(current_usage.mau - max_plan.mau, 0);
  result.bandwidth := GREATEST(current_usage.bandwidth - max_plan.bandwidth, 0);
  result.storage := GREATEST(current_usage.storage - max_plan.storage, 0);
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_metered_usage"("orgid" "uuid") OWNER TO "postgres";


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
    AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Declare
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM public.apps WHERE apps.app_id=get_org_owner_id.app_id into org_owner_id;
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
End;
$$;


ALTER FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
<<get_org_perm_for_apikey>>
Declare
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT public.get_user_id(apikey) into apikey_user_id;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    return 'INVALID_APIKEY';
  END IF;

  SELECT owner_org FROM public.apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    return 'NO_APP';
  END IF;

  SELECT user_right FROM public.org_users
  INTO user_perm
  WHERE user_id=apikey_user_id
  AND org_users.org_id=get_org_perm_for_apikey.org_id;

  IF user_perm IS NULL THEN
    PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
    return 'perm_none';
  END IF;

  -- For compatibility reasons if you are a super_admin we will return "owner"
  -- The old cli relies on this behaviour, on get_org_perm_for_apikey_v2 we will change that
  IF user_perm='super_admin'::"public"."user_min_right" THEN
    return 'perm_owner';
  END IF;

  RETURN format('perm_%s', user_perm);
END;$$;


ALTER FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer)
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
    SELECT * FROM public.apikeys WHERE key = api_key_text INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    -- Check if API key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RAISE EXCEPTION 'API key has expired';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v6(user_id) AS orgs
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

  RETURN QUERY SELECT * FROM public.get_orgs_v6(user_id);
END;
$$;


ALTER FUNCTION "public"."get_orgs_v6"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer)
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
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > now())
        AND si.subscription_anchor_end > now())
      OR si.trial_at > now()
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > now() - date_trunc('MONTH', now())
        THEN date_trunc('MONTH', now() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', now())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      -- should_redact: true if org enforces 2FA and user doesn't have 2FA
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- Redact sensitive fields if user doesn't have 2FA access
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - now()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - now()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', now()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;


ALTER FUNCTION "public"."get_orgs_v6"("userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer)
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

    -- Check if API key is expired
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


CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer)
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
  -- Compute next stats update info for all paying orgs at once
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > now())
        AND si.subscription_anchor_end > now())
      OR si.trial_at > now()
    )
  ),
  -- Calculate current billing cycle for each org
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > now() - date_trunc('MONTH', now())
        THEN date_trunc('MONTH', now() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', now())
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
      -- 2fa_has_access: true if enforcing_2fa is false OR (enforcing_2fa is true AND user has 2FA)
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      -- should_redact: true if org enforces 2FA and user doesn't have 2FA
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  ),
  -- Calculate password policy access status for user/org combinations
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      -- password_has_access: true if no policy OR (has policy AND user meets it)
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      -- should_redact: true if org has policy and user doesn't meet it
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- Redact sensitive fields if user doesn't have 2FA or password policy access
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - now()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - now()::date > 0))
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
        public.get_next_cron_time('0 3 * * *', now()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  JOIN password_policy_access ppa ON ppa.org_id = o.id
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
Declare  
 is_found uuid;
Begin
  SELECT user_id
  INTO is_found
  FROM public.apikeys
  WHERE key=apikey;
  RETURN is_found;
End;  
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
begin
  select orgs.id FROM public.orgs
  into org_id
  where orgs.created_by=get_user_main_org_id.user_id
  limit 1;

  return org_id;
End;
$$;


ALTER FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
begin
  select apps.owner_org FROM public.apps
  into org_id
  where ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  limit 1;

  return org_id;
End;
$$;


ALTER FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") OWNER TO "postgres";


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
    "cli_version" character varying
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
  where coalesce(app_versions_meta.size, 0) = 0
  AND app_versions.deleted=false
  AND app_versions.storage_provider != 'external'
  AND now() - app_versions.created_at > interval '120 seconds';
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
Begin
  RETURN public.has_app_right_userid("appid", "right", (select auth.uid()));
End;
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
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  SELECT * FROM public.apikeys WHERE key = apikey INTO api_key;
  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', appid));
          RETURN false;
      END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT (appid = ANY(api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', appid));
        RETURN false;
    END IF;
  END IF;

  allowed := public.check_min_rights("right", userid, org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', "right"::text, 'userid', userid));
  END IF;
  RETURN allowed;
End;
$$;


ALTER FUNCTION "public"."has_app_right_apikey"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid", "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  allowed boolean;
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  allowed := public.check_min_rights("right", userid, org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_USERID', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', "right"::text, 'userid', userid));
  END IF;
  RETURN allowed;
End;
$$;


ALTER FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE org record; invited_user record; current_record record; current_tmp_user record;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
  IF org IS NULL THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::varchar, NULL::bigint) AND (invite_type is distinct from 'super_admin'::public.user_min_right or invite_type is distinct from 'invite_super_admin'::public.user_min_right)) THEN RETURN 'NO_RIGHTS'; END IF;
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;
  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record FROM public.org_users WHERE public.org_users.user_id=invited_user.id AND public.org_users.org_id=invite_user_to_org.org_id;
    IF current_record IS NOT NULL THEN RETURN 'ALREADY_INVITED';
    ELSE INSERT INTO public.org_users (user_id, org_id, user_right) VALUES (invited_user.id, invite_user_to_org.org_id, invite_type); RETURN 'OK'; END IF;
  ELSE
    SELECT * INTO current_tmp_user FROM public.tmp_users WHERE public.tmp_users.email=invite_user_to_org.email AND public.tmp_users.org_id=invite_user_to_org.org_id;
    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN RETURN 'TOO_RECENT_INVITATION_CANCELATION'; ELSE RETURN 'NO_EMAIL'; END IF;
      ELSE RETURN 'ALREADY_INVITED'; END IF;
    ELSE RETURN 'NO_EMAIL'; END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") OWNER TO "postgres";


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
    RETURN public.is_admin((select auth.uid()));
END;  
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE admin_ids_jsonb jsonb; is_admin_flag boolean; mfa_verified boolean;
BEGIN
  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  SELECT public.verify_mfa() INTO mfa_verified;
  RETURN is_admin_flag AND mfa_verified;
END;
$$;


ALTER FUNCTION "public"."is_admin"("userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM apikey;
  RETURN public.is_allowed_action_org((select owner_org FROM public.apps where app_id=appid));
END;
$$;


ALTER FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
    RETURN public.is_paying_and_good_plan_org(orgid);
End;
$$;


ALTER FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions);
End;
$$;


ALTER FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apikeys
  WHERE key=apikey
  AND mode=ANY(keymode)));
End;  
$$;


ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND public.is_app_owner(public.get_user_id(apikey), app_id);
End;  
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
    RETURN public.is_app_owner((select auth.uid()), appid);
END;  
$$;


ALTER FUNCTION "public"."is_app_owner"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN public.is_app_owner(public.get_user_id(apikey), appid);
End;
$$;


ALTER FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid
  AND user_id=userid));
End;  
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


CREATE OR REPLACE FUNCTION "public"."is_canceled_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND status = 'canceled'));
End;  
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
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM public.orgs
  JOIN public.org_users on org_users.org_id = orgs.id
  WhERE org_users.user_id = is_member_of_org.user_id AND
  orgs.id = is_member_of_org.org_id;
  RETURN is_found != 0;
End;
$$;


ALTER FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_not_deleted"("email_check" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Declare  
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM public.deleted_account
  WHERE email=email_check;
  RETURN is_found = 0;
End; 
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
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE owner_org=orgid)) AND (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE owner_org=orgid));
End;
$$;


ALTER FUNCTION "public"."is_onboarded_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
Begin
  RETURN (NOT public.is_onboarded_org(orgid)) AND public.is_trial_org(orgid) = 0;
End;
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
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND (
    (status = 'succeeded' AND is_good_plan = true)
    OR (trial_at::date - (now())::date > 0)
  )
  )
);
End;  
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
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND status = 'succeeded'));
End;  
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
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid));
End;  
$$;


ALTER FUNCTION "public"."is_trial_org"("orgid" "uuid") OWNER TO "postgres";


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
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
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
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
DECLARE
    val RECORD;
    is_different boolean;
BEGIN
    -- API key? We do not care
    IF (select auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF public.check_min_rights('admin'::"public"."user_min_right", (select auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    for val in
      select * from json_each_text(row_to_json(NEW))
    loop
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD
      INTO is_different;

      IF is_different AND val.key <> 'version' AND val.key <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    end loop;

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
    DATE_TRUNC('day', device_usage.timestamp)::date AS date,
    COUNT(DISTINCT device_usage.device_id) AS mau,
    device_usage.app_id
  FROM public.device_usage
  WHERE
    device_usage.app_id = p_app_id
    AND device_usage.timestamp >= p_period_start
    AND device_usage.timestamp < p_period_end
  GROUP BY DATE_TRUNC('day', device_usage.timestamp)::date, device_usage.app_id
  ORDER BY date;
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


CREATE OR REPLACE FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "version_id" bigint, "date" timestamp without time zone, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    version_usage.app_id,
    version_usage.version_id as version_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage
  WHERE
    version_usage.app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY date, version_usage.app_id, version_usage.version_id
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

    -- If app not found or no owner_org, reject access
    IF v_owner_org IS NULL THEN
        RETURN true;
    END IF;

    -- Get the current user identity (works for both JWT auth and API key)
    -- Using get_identity with key_mode array to support CLI API key authentication
    v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

    -- If no user identity found, reject access
    IF v_user_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO v_org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = v_owner_org;

    -- If org not found, reject access
    IF v_org_enforcing_2fa IS NULL THEN
        RETURN true;
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
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE end_time < now() - interval '1 day';
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
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = rescind_invitation.email AND public.tmp_users.org_id = rescind_invitation.org_id;
  IF NOT FOUND THEN RETURN 'NO_INVITATION'; END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN RETURN 'ALREADY_CANCELLED'; END IF;
  UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") OWNER TO "postgres";


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
  -- Get the current owner_org
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  -- Check if app exists
  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  -- Get the current user ID
  v_user_id := (select auth.uid());

  IF NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, v_old_org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: TRANSFER_OLD_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the old organization)';
  END IF;

  IF NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, p_new_org_id, NULL::character varying, NULL::bigint)) THEN
    PERFORM public.pg_log('deny: TRANSFER_NEW_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the new organization)';
  END IF;

  -- Check if enough time has passed since last transfer
  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  -- Update the app's owner_org and user_id
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

  -- Update app_versions owner_org
  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update app_versions_meta owner_org
  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channel_devices owner_org
  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channels owner_org
  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update notifications owner_org
  UPDATE public.notifications
  SET owner_org = p_new_org_id
  WHERE owner_org = v_old_org_id;
END;
$$;


ALTER FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") IS 'Transfers an app and all its related data to a new organization. Requires the caller to have appropriate permissions on both organizations.';



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
    -- Use a more efficient approach with direct timestamp comparison
    UPDATE public.app_versions
    SET deleted = true
    WHERE app_versions.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) < 63113904
      AND app_versions.created_at < (
          SELECT now() - make_interval(secs => apps.retention)
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
Begin
  RETURN (
    array[(select coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
      select
          case
            when count(id) > 0 then array['aal2']
            else array['aal1', 'aal2']
          end as aal
        from auth.mfa_factors
        where (select auth.uid()) = user_id and status = 'verified'
    )
  ) OR (
    EXISTS(
      SELECT 1 FROM jsonb_array_elements((select auth.jwt())->'amr') AS amr_elem
      WHERE amr_elem->>'method' = 'otp'
    )
  );
End;  
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
    CONSTRAINT "build_requests_platform_check" CHECK ((("platform")::"text" = ANY (ARRAY[('ios'::character varying)::"text", ('android'::character varying)::"text", ('both'::character varying)::"text"])))
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
    "allow_prod" boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY "public"."channels" REPLICA IDENTITY FULL;


ALTER TABLE "public"."channels" OWNER TO "postgres";


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
    "version_id" bigint NOT NULL,
    "get" bigint,
    "fail" bigint,
    "install" bigint,
    "uninstall" bigint
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
    "plan_enterprise" integer DEFAULT 0
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
    "user_right" "public"."user_min_right"
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
    "max_apikey_expiration_days" integer
);

ALTER TABLE ONLY "public"."orgs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orgs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orgs"."enforcing_2fa" IS 'When true, all members of this organization must have 2FA enabled to access the organization';



COMMENT ON COLUMN "public"."orgs"."email_preferences" IS 'JSONB object containing email notification preferences for the organization. When enabled, emails are also sent to the management_email if it differs from admin user emails. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. All default to true.';



COMMENT ON COLUMN "public"."orgs"."password_policy_config" IS 'JSON configuration for password policy: {enabled: boolean, min_length: number, require_uppercase: boolean, require_number: boolean, require_special: boolean}';



COMMENT ON COLUMN "public"."orgs"."enforce_hashed_api_keys" IS 'When true, only hashed API keys can access this organization. Plain-text keys will be rejected.';



COMMENT ON COLUMN "public"."orgs"."require_apikey_expiration" IS 'When true, API keys used with this organization must have an expiration date set.';



COMMENT ON COLUMN "public"."orgs"."max_apikey_expiration_days" IS 'Maximum number of days an API key can be valid when creating/updating keys limited to this org. NULL means no maximum.';



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
    "subscription_metered" json DEFAULT '{}'::json NOT NULL,
    "subscription_anchor_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_anchor_end" timestamp with time zone DEFAULT "public"."one_month_ahead"() NOT NULL,
    "canceled_at" timestamp with time zone,
    "mau_exceeded" boolean DEFAULT false,
    "storage_exceeded" boolean DEFAULT false,
    "bandwidth_exceeded" boolean DEFAULT false,
    "id" integer NOT NULL,
    "plan_calculated_at" timestamp with time zone,
    "build_time_exceeded" boolean DEFAULT false
);

ALTER TABLE ONLY "public"."stripe_info" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stripe_info" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stripe_info"."build_time_exceeded" IS 'Organization exceeded build time limit';



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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "email_preferences" "jsonb" DEFAULT '{"onboarding": true, "usage_limit": true, "credit_usage": true, "device_error": true, "weekly_stats": true, "monthly_stats": true, "bundle_created": true, "bundle_deployed": true, "deploy_stats_24h": true, "billing_period_stats": true, "channel_self_rejected": true}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."email_preferences" IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. Values are booleans.';



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
    "version_id" bigint NOT NULL,
    "action" "public"."version_action" NOT NULL
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



ALTER TABLE ONLY "public"."app_metrics_cache"
    ADD CONSTRAINT "app_metrics_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");



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
    ADD CONSTRAINT "daily_version_pkey" PRIMARY KEY ("date", "app_id", "version_id");



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



ALTER TABLE ONLY "public"."manifest"
    ADD CONSTRAINT "manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("owner_org", "event", "uniq_id");



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");



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



ALTER TABLE ONLY "public"."version_usage"
    ADD CONSTRAINT "version_usage_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "action");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



CREATE INDEX "apikeys_key_idx" ON "public"."apikeys" USING "btree" ("key");



CREATE UNIQUE INDEX "app_metrics_cache_org_id_key" ON "public"."app_metrics_cache" USING "btree" ("org_id");



CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");



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



CREATE INDEX "org_users_app_id_idx" ON "public"."org_users" USING "btree" ("app_id");



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



CREATE OR REPLACE TRIGGER "force_valid_apikey_name" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."auto_apikey_name_by_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions" BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions_meta" BEFORE INSERT OR UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channel_devices" BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channels" BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "generate_org_on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_on_user_create"();



CREATE OR REPLACE TRIGGER "generate_org_user_on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_user_on_org_create"();



CREATE OR REPLACE TRIGGER "handle_build_requests_updated_at" BEFORE UPDATE ON "public"."build_requests" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."capgo_credits_steps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."tmp_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



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



CREATE POLICY "Allow admin to delete webhooks" ON "public"."webhooks" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to insert webhook_deliveries" ON "public"."webhook_deliveries" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to insert webhooks" ON "public"."webhooks" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to update webhook_deliveries" ON "public"."webhook_deliveries" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow admin to update webhooks" ON "public"."webhooks" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



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



CREATE POLICY "Allow org members to select webhook_deliveries" ON "public"."webhook_deliveries" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org members to select webhooks" ON "public"."webhooks" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", ( SELECT "public"."get_identity"() AS "get_identity"), "org_id", NULL::character varying, NULL::bigint));



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



CREATE POLICY "Allow read for org admin" ON "public"."usage_credit_consumptions" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow read for org admin" ON "public"."usage_credit_grants" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow read for org admin" ON "public"."usage_credit_transactions" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow read for org admin" ON "public"."usage_overage_events" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "org_id", NULL::character varying, NULL::bigint));



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



CREATE POLICY "Users read own or org admin builds" ON "public"."build_logs" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."org_users"
  WHERE (("org_users"."org_id" = "build_logs"."org_id") AND ("org_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("org_users"."user_right" = ANY (ARRAY['super_admin'::"public"."user_min_right", 'admin'::"public"."user_min_right"])))))));



CREATE POLICY "Users read own org build requests" ON "public"."build_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."org_users"
  WHERE (("org_users"."org_id" = "build_requests"."owner_org") AND ("org_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users read own org build time" ON "public"."daily_build_time" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_build_time"."app_id")::"text") AND (EXISTS ( SELECT 1
           FROM "public"."org_users"
          WHERE (("org_users"."org_id" = "apps"."owner_org") AND ("org_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



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


ALTER TABLE "public"."manifest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";



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



GRANT ALL ON FUNCTION "public"."check_org_user_privileges"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_user_privileges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_user_privileges"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_apikeys"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_apikeys"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_apikeys"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_queue_messages"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_queue_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_queue_messages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_channel_device_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_channel_device_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_channel_device_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_usage_credits"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_usage_credits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_usage_credits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "service_role";









GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_removal_date"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_removal_date"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_removal_date"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_apikey"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_apikey"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_db_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_db_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_db_url"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_owner_id"("apikey" "text", "app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_orgs_v6"("userid" "uuid") FROM PUBLIC;
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



GRANT ALL ON FUNCTION "public"."get_update_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_update_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_update_stats"() TO "service_role";



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



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_versions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_versions_with_no_metadata"() TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."modify_permissions_tmp"("email" "text", "org_id" "uuid", "new_role" "public"."user_min_right") TO "service_role";



GRANT ALL ON FUNCTION "public"."noupdate"() TO "anon";
GRANT ALL ON FUNCTION "public"."noupdate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."noupdate"() TO "service_role";



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
GRANT ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_admin_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_admin_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_admin_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_all_cron_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_all_cron_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_all_cron_tasks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_billing_period_stats_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_billing_period_stats_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_billing_period_stats_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_deploy_install_stats_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_deploy_install_stats_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_deploy_install_stats_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_failed_uploads"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_free_trial_expired"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_free_trial_expired"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_stats_email_monthly"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_stats_email_monthly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_stats_email_monthly"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_stats_email_weekly"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_stats_email_weekly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_stats_email_weekly"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_subscribed_orgs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscribed_orgs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") TO "service_role";



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
GRANT ALL ON FUNCTION "public"."record_deployment_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_deployment_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_deployment_history"() TO "service_role";



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
GRANT ALL ON FUNCTION "public"."remove_old_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."remove_old_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_old_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_metrics_cache" TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_mau_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_storage_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."total_bundle_storage_bytes"() TO "anon";
GRANT ALL ON FUNCTION "public"."total_bundle_storage_bytes"() TO "authenticated";
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



GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_app_versions_retention"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_app_versions_retention"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_webhook_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_webhook_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_webhook_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "service_role";



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



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."plans" TO "service_role";



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
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "service_role";




























