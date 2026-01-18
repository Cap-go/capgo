-- Migration: Add daily fail ratio email notifications
-- Purpose: Send daily emails to app owners when their install fail rate exceeds a threshold
-- This replaces the old per-device "weak signal" notification system that only sent one email per week

-- Function to calculate daily fail ratio and queue emails for apps with high failure rates
CREATE OR REPLACE FUNCTION public.process_daily_fail_ratio_email() RETURNS void LANGUAGE plpgsql
SET
search_path = '' AS $$
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

ALTER FUNCTION public.process_daily_fail_ratio_email() OWNER TO postgres;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.process_daily_fail_ratio_email() FROM public;
GRANT EXECUTE ON FUNCTION public.process_daily_fail_ratio_email() TO service_role;

-- Register cron task to run daily at 08:00:00 UTC
-- Note: The cron_tasks table is the canonical way to register tasks in this codebase.
-- The process_all_cron_tasks function reads from this table to execute scheduled tasks.
INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    batch_size,
    second_interval,
    minute_interval,
    hour_interval,
    run_at_hour,
    run_at_minute,
    run_at_second,
    run_on_dow,
    run_on_day
) VALUES (
    'daily_fail_ratio_email',
    'Send daily email alerts for apps with high install failure rates (>30%)',
    'function',
    'public.process_daily_fail_ratio_email()',
    null,  -- batch_size not needed for function type
    null,  -- second_interval
    null,  -- minute_interval
    null,  -- hour_interval
    8,     -- run_at_hour (08:00 UTC)
    0,     -- run_at_minute
    0,     -- run_at_second
    null,  -- run_on_dow (any day)
    null   -- run_on_day (any day)
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    task_type = EXCLUDED.task_type,
    target = EXCLUDED.target,
    run_at_hour = EXCLUDED.run_at_hour,
    run_at_minute = EXCLUDED.run_at_minute,
    run_at_second = EXCLUDED.run_at_second,
    updated_at = NOW();

-- Backfill daily_fail_ratio preference for existing users who have email_preferences set
UPDATE public.users
SET email_preferences = email_preferences || '{"daily_fail_ratio": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'daily_fail_ratio');

-- Backfill daily_fail_ratio preference for existing orgs who have email_preferences set
UPDATE public.orgs
SET email_preferences = email_preferences || '{"daily_fail_ratio": true}'::jsonb
WHERE email_preferences IS NOT NULL
  AND NOT (email_preferences ? 'daily_fail_ratio');
