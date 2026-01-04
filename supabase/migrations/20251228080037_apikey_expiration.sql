-- API Key Expiration Feature
-- Adds optional expiration dates to API keys with organization-level policies

-- =============================================================================
-- 1. Add expires_at column to apikeys table
-- =============================================================================
ALTER TABLE "public"."apikeys"
ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN "public"."apikeys"."expires_at" IS 'When this API key expires. NULL means never expires.';

-- Index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_apikeys_expires_at ON "public"."apikeys" ("expires_at")
WHERE expires_at IS NOT NULL;

-- =============================================================================
-- 2. Add organization policy columns to orgs table
-- =============================================================================
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "require_apikey_expiration" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "max_apikey_expiration_days" integer DEFAULT NULL;

COMMENT ON COLUMN "public"."orgs"."require_apikey_expiration" IS 'When true, API keys used with this organization must have an expiration date set.';
COMMENT ON COLUMN "public"."orgs"."max_apikey_expiration_days" IS 'Maximum number of days an API key can be valid when creating/updating keys limited to this org. NULL means no maximum.';

-- =============================================================================
-- 3. Helper function to check if API key is expired
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone)
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
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

-- =============================================================================
-- 4. Cleanup function for expired API keys (30-day grace period)
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."cleanup_expired_apikeys"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM "public"."apikeys"
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW() - INTERVAL '30 days';
END;
$$;

-- =============================================================================
-- 5. Update get_identity functions to check expiration
-- =============================================================================

-- Update get_identity(keymode key_mode[]) to check expiration
CREATE OR REPLACE FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
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

  -- Fetch the api key
  select * FROM public.apikeys
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM NULL THEN
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

-- Update get_identity_apikey_only(keymode key_mode[]) to check expiration
CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM NULL THEN
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

-- =============================================================================
-- 6. Update consolidated cron function to include expired apikey cleanup
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."process_all_cron_tasks" ()
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_second integer := EXTRACT(SECOND FROM now())::integer;
  current_minute integer := EXTRACT(MINUTE FROM now())::integer;
  current_hour integer := EXTRACT(HOUR FROM now())::integer;
BEGIN
  -- Every 10 seconds - High-frequency tasks (combined processing)
  IF current_second % 10 = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY[
        'channel_update',
        'on_app_create',
        'user_create',
        'on_app_version_create',
        'on_channel_create'
      ]);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'High-frequency queue processing failed: %', SQLERRM;
    END;
  END IF;

  -- Every 60 seconds - Medium-frequency tasks (combined processing)
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY[
        'app_version_on_delete',
        'cache_invalidation',
        'on_app_update',
        'on_org_create',
        'on_version_update',
        'on_version_delete',
        'on_channel_delete',
        'on_channel_update',
        'on_bundle_retry',
        'on_device_insert'
      ]);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Medium-frequency queue processing failed: %', SQLERRM;
    END;

    -- Clear tmp_users table every minute
    BEGIN
      DELETE FROM "public"."tmp_users" WHERE created_at < NOW() - INTERVAL '1 hour';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'tmp_users cleanup failed: %', SQLERRM;
    END;
  END IF;

  -- Every 5 minutes (at :00, :05, :10, etc.) - Metrics-related processing
  IF current_second = 0 AND current_minute % 5 = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY[
        'update_app_metrics',
        'update_channel_device_counts',
        'on_bundle_counts'
      ]);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Metrics queue processing failed: %', SQLERRM;
    END;
  END IF;

  -- Every 15 minutes (at :00, :15, :30, :45) - Plan/subscription updates
  IF current_second = 0 AND current_minute % 15 = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY[
        'cron_good_plan',
        'on_stripe_event'
      ]);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Plan/subscription queue processing failed: %', SQLERRM;
    END;
  END IF;

  -- Hourly at the start of each hour - Account deletion and cleanup
  IF current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.delete_accounts_marked_for_deletion();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_accounts_marked_for_deletion failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:00:00 - Stats processing
  IF current_hour = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY[
        'cron_stats'
      ]);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Stats queue processing failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:01:00 - Manifest stats
  IF current_hour = 0 AND current_minute = 1 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_manifest_daily_stats();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_manifest_daily_stats failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 01:01:00 - Admin stats creation
  IF current_hour = 1 AND current_minute = 1 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_admin_stats();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_admin_stats failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 03:00:00 - Free trial, credits, audit log, and expired API key cleanup
  IF current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_free_trial_expired();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_free_trial_expired failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.expire_usage_credits();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_usage_credits failed: %', SQLERRM;
    END;

    -- Cleanup old audit logs (90-day retention)
    BEGIN
      PERFORM public.cleanup_old_audit_logs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_old_audit_logs failed: %', SQLERRM;
    END;

    -- Cleanup expired API keys (30-day grace period after expiration)
    BEGIN
      PERFORM public.cleanup_expired_apikeys();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_expired_apikeys failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 04:00:00 - Sync sub scheduler
  IF current_hour = 4 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_sync_sub_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_sync_sub_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 12:00:00 - Noon tasks
  IF current_hour = 12 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup job_run_details failed: %', SQLERRM;
    END;

    -- Weekly stats email (every Saturday at noon)
    IF EXTRACT(DOW FROM now()) = 6 THEN
      BEGIN
        PERFORM public.process_stats_email_weekly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_weekly failed: %', SQLERRM;
      END;
    END IF;

    -- Monthly stats email (1st of month at noon)
    IF EXTRACT(DAY FROM now()) = 1 THEN
      BEGIN
        PERFORM public.process_stats_email_monthly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_monthly failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- Daily at 06:00:00 - Production deploy stats email
  IF current_hour = 6 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_production_deploy_stats_email();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_production_deploy_stats_email failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 07:00:00 - Install stats email
  IF current_hour = 7 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_install_stats_email();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_install_stats_email failed: %', SQLERRM;
    END;
  END IF;
END;
$$;
