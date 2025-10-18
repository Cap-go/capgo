-- Consolidated migration for schedule_app_stats system
-- This migration includes all functions and cron jobs needed for the schedule_app_stats functionality

-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to get paying and trial organizations
CREATE OR REPLACE FUNCTION "public"."get_paying_and_trial_orgs" () RETURNS TABLE (
  "org_id" "uuid",
  "org_name" "text"
) LANGUAGE "plpgsql"
SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id AS org_id,
    o.name AS org_name
  FROM public.orgs o
  WHERE o.customer_id IS NOT NULL
    AND (
      -- Check if org is paying (has successful stripe subscription)
      EXISTS (
        SELECT 1
        FROM public.stripe_info si
        WHERE si.customer_id = o.customer_id
          AND si.status = 'succeeded'
      )
      OR
      -- Check if org is in trial (trial_at is in the future)
      EXISTS (
        SELECT 1
        FROM public.stripe_info si
        WHERE si.customer_id = o.customer_id
          AND si.trial_at IS NOT NULL
          AND si.trial_at > NOW()
      )
    );
END;
$$;

-- Set ownership for get_paying_and_trial_orgs
ALTER FUNCTION "public"."get_paying_and_trial_orgs" () OWNER TO "postgres";

-- Revoke all existing permissions for get_paying_and_trial_orgs
REVOKE ALL ON FUNCTION "public"."get_paying_and_trial_orgs" () FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_paying_and_trial_orgs" () FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_paying_and_trial_orgs" () FROM "authenticated";

-- Grant access only to service_role and postgres for get_paying_and_trial_orgs
GRANT EXECUTE ON FUNCTION "public"."get_paying_and_trial_orgs" () TO "service_role";
GRANT ALL ON FUNCTION "public"."get_paying_and_trial_orgs" () TO "postgres";

-- Create function to get active apps by organization with SQL grouping
CREATE OR REPLACE FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) RETURNS TABLE (
    "org_id" "uuid",
    "app_id" "text",
    "device_count" bigint,
    "last_activity" "timestamp"
) LANGUAGE "plpgsql"
SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.owner_org AS org_id,
    du.app_id,
    COUNT(DISTINCT du.device_id) AS device_count,
    MAX(du.timestamp) AS last_activity
  FROM public.device_usage du
  INNER JOIN public.apps a ON du.app_id = a.app_id
  WHERE 
    a.owner_org = ANY(org_ids)
    AND du.timestamp >= start_date
    AND du.timestamp < end_date
  GROUP BY a.owner_org, du.app_id
  ORDER BY a.owner_org, device_count DESC;
END;
$$;

-- Set ownership for get_active_apps_by_org
ALTER FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) OWNER TO "postgres";

-- Revoke all existing permissions for get_active_apps_by_org
REVOKE ALL ON FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) FROM "authenticated";

-- Grant access only to service_role and postgres for get_active_apps_by_org
GRANT EXECUTE ON FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_active_apps_by_org" (
    "org_ids" "uuid"[],
    "start_date" "timestamp",
    "end_date" "timestamp"
) TO "postgres";

-- Remove automatic cron scheduling for cron_stat_app
-- This will make cron_stat_app only schedulable from schedule_app_stats
SELECT cron.unschedule('process_cron_stat_app_jobs');

-- Drop the process_cron_stats_jobs function since it's no longer needed
-- schedule_app_stats will handle scheduling cron_stat_app jobs directly
DROP FUNCTION IF EXISTS "public"."process_cron_stats_jobs" ();

-- Create function to schedule cron_stat_app jobs for a list of apps
CREATE OR REPLACE FUNCTION "public"."schedule_cron_stat_app_jobs" (
    "apps" jsonb
) RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    app_record jsonb;
BEGIN
    -- Validate input
    IF apps IS NULL OR NOT jsonb_typeof(apps) = 'array' THEN
        RAISE EXCEPTION 'apps parameter must be a JSON array';
    END IF;
    
    -- Loop through each app and queue cron_stat_app job
    FOR app_record IN SELECT * FROM jsonb_array_elements(apps)
    LOOP
        -- Validate app record structure
        IF NOT (app_record ? 'app_id' AND app_record ? 'org_id') THEN
            RAISE EXCEPTION 'Each app record must contain app_id and org_id fields';
        END IF;
        
        -- Queue the cron_stat_app job
        PERFORM pgmq.send('cron_stat_app',
            jsonb_build_object(
                'function_name', 'cron_stat_app',
                'function_type', 'cloudflare',
                'payload', jsonb_build_object(
                    'appId', app_record->>'app_id',
                    'orgId', app_record->>'org_id',
                    'todayOnly', false
                )
            )
        );
    END LOOP;
END;
$$;

-- Set ownership for schedule_cron_stat_app_jobs
ALTER FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) OWNER TO "postgres";

-- Revoke all existing permissions for schedule_cron_stat_app_jobs
REVOKE ALL ON FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) FROM "anon";
REVOKE ALL ON FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) FROM "authenticated";

-- Grant access only to service_role and postgres for schedule_cron_stat_app_jobs
GRANT EXECUTE ON FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) TO "service_role";
GRANT ALL ON FUNCTION "public"."schedule_cron_stat_app_jobs" (jsonb) TO "postgres";

-- Create a function to handle the scheduled job logic using vault secrets
CREATE OR REPLACE FUNCTION "public"."schedule_app_stats_job" () RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    supabase_url text;
    api_secret text;
BEGIN
    -- Get the Supabase URL from vault
    SELECT decrypted_secret INTO supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL';
    
    -- Get the API secret from vault
    SELECT decrypted_secret INTO api_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'API_SECRET';
    
    -- Check if both secrets are available
    IF supabase_url IS NULL OR api_secret IS NULL THEN
        RAISE NOTICE 'Schedule app stats job skipped: missing vault secrets (SUPABASE_URL or API_SECRET)';
        RETURN;
    END IF;
    
    -- Make the HTTP request to the schedule_app_stats function
    PERFORM net.http_post(
        url := supabase_url || '/functions/v1/triggers/schedule_app_stats',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apisecret', api_secret
        ),
        body := '{}'::jsonb
    );
    
    -- Log success
    RAISE NOTICE 'Schedule app stats job completed successfully';
END;
$$;

-- Set ownership
ALTER FUNCTION "public"."schedule_app_stats_job" () OWNER TO "postgres";

-- Grant access only to service_role and postgres
GRANT EXECUTE ON FUNCTION "public"."schedule_app_stats_job" () TO "service_role";
GRANT ALL ON FUNCTION "public"."schedule_app_stats_job" () TO "postgres";

-- Create the cron job that calls the function
-- Runs every 3 hours at minute 0 (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00)
SELECT cron.schedule(
    'schedule-app-stats-job',
    '0 */3 * * *',
    'SELECT public.schedule_app_stats_job();'
);
