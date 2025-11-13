-- Add support for processing multiple queues in a single function call
-- This allows consolidating multiple cron jobs into fewer jobs
-- Overloaded function that accepts an array of queue names
-- Uses exception handling to ensure one queue failure doesn't block others
-- Drop old function signatures if they exist (changing return type from bigint to void)
-- Only drop process_function_queue overloads that existed before this migration
DROP FUNCTION IF EXISTS "public"."process_function_queue" ("queue_name" "text", "batch_size" integer);

CREATE OR REPLACE FUNCTION "public"."process_function_queue" (
  "queue_names" "text" [],
  "batch_size" integer DEFAULT 950
) RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
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

ALTER FUNCTION "public"."process_function_queue" ("queue_names" "text" [], "batch_size" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text" [], "batch_size" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text" [], "batch_size" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_names" "text" [], "batch_size" integer) TO "service_role";

-- Add a convenience wrapper function that accepts comma-separated queue names as text
CREATE OR REPLACE FUNCTION "public"."process_function_queues" (
  "queue_names_csv" "text",
  "batch_size" integer DEFAULT 950
) RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  queue_names_array text[];
BEGIN
  -- Convert comma-separated string to array
  queue_names_array := string_to_array(queue_names_csv, ',');

  -- Trim whitespace from each queue name
  queue_names_array := array(
    SELECT trim(unnest) FROM unnest(queue_names_array)
  );

  -- Call the array-based function (fire-and-forget)
  PERFORM public.process_function_queue(queue_names_array, batch_size);
END;
$$;

ALTER FUNCTION "public"."process_function_queues" ("queue_names_csv" "text", "batch_size" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."process_function_queues" ("queue_names_csv" "text", "batch_size" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."process_function_queues" ("queue_names_csv" "text", "batch_size" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_function_queues" ("queue_names_csv" "text", "batch_size" integer) TO "service_role";

-- Update the single-queue function to use 8-second timeout for better pg_net throughput
-- Original had 15 seconds which was risky given pg_net's 200 req/s limit
-- Fire-and-forget: uses PERFORM instead of SELECT INTO for true non-blocking behavior
CREATE OR REPLACE FUNCTION "public"."process_function_queue" (
  "queue_name" "text",
  "batch_size" integer DEFAULT 950
) RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
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

ALTER FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "service_role";

-- Consolidate cron jobs from 37 to ~15 jobs using the new multi-queue processing function
-- This reduces the number of cron jobs to stay within Supabase's recommended limits
-- First, unschedule all existing jobs that will be consolidated
-- High frequency (10s) queue jobs to be consolidated
SELECT
  cron.unschedule ('process_channel_update_queue');

SELECT
  cron.unschedule ('process_user_create_queue');

SELECT
  cron.unschedule ('process_user_update_queue');

SELECT
  cron.unschedule ('process_version_delete_queue');

SELECT
  cron.unschedule ('process_version_update_queue');

SELECT
  cron.unschedule ('process_app_delete_queue');

SELECT
  cron.unschedule ('process_organization_create_queue');

SELECT
  cron.unschedule ('process_user_delete_queue');

SELECT
  cron.unschedule ('process_channel_device_counts_queue');

-- Every 2 hours queue jobs to be consolidated
SELECT
  cron.unschedule ('process_admin_stats');

SELECT
  cron.unschedule ('process_cron_email_queue');

SELECT
  cron.unschedule ('process_app_create_queue');

SELECT
  cron.unschedule ('process_version_create_queue');

SELECT
  cron.unschedule ('process_organization_delete_queue');

SELECT
  cron.unschedule ('process_deploy_history_create_queue');

SELECT
  cron.unschedule ('process_cron_clear_versions_queue');

-- Per-minute queue jobs to be consolidated
SELECT
  cron.unschedule ('delete-expired-accounts');

SELECT
  cron.unschedule ('process_cron_sync_sub_queue');

SELECT
  cron.unschedule ('process_cron_stat_app_queue');

SELECT
  cron.unschedule ('process_manifest_create_queue');

-- Every 5 minutes job to be consolidated
SELECT
  cron.unschedule ('process_cron_stat_org_queue');

-- Daily and hourly maintenance jobs to be consolidated
SELECT
  cron.unschedule ('process_free_trial_expired');

SELECT
  cron.unschedule ('cleanup_queue_messages');

SELECT
  cron.unschedule ('delete_old_deleted_apps');

SELECT
  cron.unschedule ('Remove old jobs');

SELECT
  cron.unschedule ('create_admin_stats');

SELECT
  cron.unschedule ('usage_credit_expiry');

SELECT
  cron.unschedule ('cron_sync_sub_scheduler');

SELECT
  cron.unschedule ('Delete old app version');

SELECT
  cron.unschedule ('delete-job-run-details');

SELECT
  cron.unschedule ('Cleanup frequent job details');

SELECT
  cron.unschedule ('process_cron_stat_app_jobs');

-- Email jobs to be consolidated
SELECT
  cron.unschedule ('Send stats email every month');

SELECT
  cron.unschedule ('Send stats email every week');

-- High-frequency jobs to be consolidated
SELECT
  cron.unschedule ('process_manifest_bundle_counts_queue');

SELECT
  cron.unschedule ('process_d1_replication_batch');

-- Create a single consolidated function that runs every second and intelligently decides what to execute
-- Uses exception handling to prevent one task from blocking others
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks () RETURNS void LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
BEGIN
  -- Get current time components in UTC
  current_hour := EXTRACT(HOUR FROM now());
  current_minute := EXTRACT(MINUTE FROM now());
  current_second := EXTRACT(SECOND FROM now());

  -- Every second: D1 replication
  BEGIN
    PERFORM process_d1_replication_batch();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'process_d1_replication_batch failed: %', SQLERRM;
  END;

  -- Every 10 seconds: High-frequency queues (at :00, :10, :20, :30, :40, :50)
  IF current_second % 10 = 0 THEN
    -- Process high-frequency queues with default batch size (950)
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (high-frequency) failed: %', SQLERRM;
    END;

    -- Process channel device counts with batch size 1000
    BEGIN
      PERFORM public.process_channel_device_counts_queue(1000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_channel_device_counts_queue failed: %', SQLERRM;
    END;

    -- Process manifest bundle counts with batch size 1000
    BEGIN
      PERFORM public.process_manifest_bundle_counts_queue(1000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_manifest_bundle_counts_queue failed: %', SQLERRM;
    END;
  END IF;

  -- Every minute (at :00 seconds): Per-minute tasks
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.delete_accounts_marked_for_deletion();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_accounts_marked_for_deletion failed: %', SQLERRM;
    END;

    -- Process with batch size 10
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_sync_sub', 'cron_stat_app'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (per-minute) failed: %', SQLERRM;
    END;

    -- on_manifest_create uses default batch size
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_manifest_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (manifest_create) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 5 minutes (at :00 seconds): Org stats with batch size 10
  IF current_minute % 5 = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_stat_org'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (cron_stat_org) failed: %', SQLERRM;
    END;
  END IF;

  -- Every hour (at :00:00): Hourly cleanup
  IF current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM cleanup_frequent_job_details();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_frequent_job_details failed: %', SQLERRM;
    END;
  END IF;

  -- Every 2 hours (at :00:00): Low-frequency queues with default batch size
  IF current_hour % 2 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_version_create', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (low-frequency) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 6 hours (at :00:00): Stats jobs
  IF current_hour % 6 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM process_cron_stats_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_stats_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:00:00 - Midnight tasks
  IF current_hour = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM cleanup_queue_messages();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_queue_messages failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM delete_old_deleted_apps();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_old_deleted_apps failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM remove_old_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remove_old_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:40:00 - Old app version retention
  IF current_hour = 0 AND current_minute = 40 AND current_second = 0 THEN
    BEGIN
      PERFORM update_app_versions_retention();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'update_app_versions_retention failed: %', SQLERRM;
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

  -- Daily at 03:00:00 - Free trial and credits
  IF current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM process_free_trial_expired();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_free_trial_expired failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.expire_usage_credits();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_usage_credits failed: %', SQLERRM;
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
        PERFORM process_stats_email_weekly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_weekly failed: %', SQLERRM;
      END;
    END IF;

    -- Monthly stats email (1st of month at noon)
    IF EXTRACT(DAY FROM now()) = 1 THEN
      BEGIN
        PERFORM process_stats_email_monthly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_monthly failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

-- Now create the single consolidated job
-- This single job runs every second and intelligently handles ALL cron tasks based on time
SELECT
  cron.schedule (
    'process_all_cron_tasks',
    '1 seconds',
    $$SELECT public.process_all_cron_tasks();$$
  );

-- Summary of consolidation:
-- BEFORE: 37 cron jobs
-- AFTER: 1 cron job (ultimate consolidation!)
--
-- Single consolidated job:
-- process_all_cron_tasks (1 seconds) - Runs every second and intelligently handles ALL tasks:
--
--   Every second:
--     - D1 replication batch processing
--
--   Every 10 seconds:
--     - 9 high-frequency queues (on_channel_update, on_user_create, on_user_update,
--       on_version_delete, on_version_update, on_app_delete, on_organization_create,
--       on_user_delete, on_app_create) with default batch size 950
--     - Channel device counts (batch size 1000)
--     - Manifest bundle counts (batch size 1000)
--
--   Every minute:
--     - Delete accounts marked for deletion
--     - 2 queues with batch size 10 (cron_sync_sub, cron_stat_app)
--     - 1 queue with default batch size (on_manifest_create)
--
--   Every 5 minutes:
--     - Org stats queue (batch size 10)
--
--   Every hour:
--     - Cleanup frequent job details
--
--   Every 2 hours:
--     - 6 low-frequency queues with default batch size (admin_stats, cron_email, on_version_create,
--       on_organization_delete, on_deploy_history_create, cron_clear_versions)
--
--   Every 6 hours:
--     - Process cron stats jobs
--
--   Daily schedules:
--     - 00:00 - Cleanup queue messages, delete old deleted apps, remove old jobs
--     - 00:40 - Update app versions retention
--     - 01:01 - Process admin stats
--     - 03:00 - Process free trial expired, expire usage credits
--     - 04:00 - Process cron sync sub jobs
--     - 12:00 - Cleanup job run details
--
--   Weekly schedule:
--     - Saturdays at 12:00 - Send stats email
--
--   Monthly schedule:
--     - 1st of month at 12:00 - Send stats email
--
-- This brings the total from 37 down to 1 job - the ultimate consolidation!
-- Well under Supabase's recommended limit of 8 jobs!
--
-- IMPORTANT NOTES:
-- 1. Exception handling ensures individual task failures don't block subsequent tasks
-- 2. Each queue in array processing has its own exception handling
-- 3. Batch sizes are preserved from original configuration:
--    - Default (950): Most queues
--    - 10: cron_sync_sub, cron_stat_app, cron_stat_org
--    - 1000: channel_device_counts, manifest_bundle_counts
-- 4. pg_net limitations (200 req/s) are respected:
--    - Each queue can make up to 10 HTTP calls
--    - Peak load: ~110-140 requests per 10-second window
--    - Sequential processing prevents overwhelming pg_net
-- 5. Tasks execute sequentially within time slots (as per original design)
-- 6. Response data is stored in unlogged tables (6-hour retention)
-- 7. HTTP requests are true fire-and-forget:
--    - Uses PERFORM instead of SELECT INTO (discards request_id for true non-blocking)
--    - net.http_post returns immediately after queuing the request
--    - Actual HTTP calls happen asynchronously in background
--    - "Blocking" only occurs during: queue size check, request queuing, sequential array processing
--    - All functions now return void for cleaner fire-and-forget semantics
