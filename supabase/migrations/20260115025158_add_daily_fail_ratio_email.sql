BEGIN;

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
        CASE
          WHEN ds.total_installs > 0 THEN ROUND((ds.total_fails::numeric / ds.total_installs::numeric) * 100, 2)
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
    -- Queue email for each app with high fail ratio
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
  END LOOP;
END;
$$;

ALTER FUNCTION public.process_daily_fail_ratio_email() OWNER TO postgres;

-- Update the consolidated cron task runner to include daily fail ratio check
-- Runs daily at 08:00:00 UTC (a reasonable time for daily digest emails)
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks() RETURNS void LANGUAGE plpgsql
SET
search_path = '' AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
BEGIN
  -- Get current time components in UTC
  current_hour := EXTRACT(HOUR FROM NOW());
  current_minute := EXTRACT(MINUTE FROM NOW());
  current_second := EXTRACT(SECOND FROM NOW());

  -- Every 10 seconds: High-frequency queues (at :00, :10, :20, :30, :40, :50)
  IF current_second % 10 = 0 THEN
    -- Process high-frequency queues with default batch size (950)
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_create', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create', 'credit_usage_alerts']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (high-frequency) failed: %', SQLERRM;
    END;

    -- Process channel device counts with batch size 1000
    BEGIN
      PERFORM public.process_channel_device_counts_queue(1000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_channel_device_counts_queue failed: %', SQLERRM;
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
      PERFORM public.cleanup_frequent_job_details();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_frequent_job_details failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.process_deploy_install_stats_email();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_deploy_install_stats_email failed: %', SQLERRM;
    END;
  END IF;

  -- Every 2 hours (at :00:00): Low-frequency queues with default batch size
  IF current_hour % 2 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (low-frequency) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 6 hours (at :00:00): Stats jobs
  IF current_hour % 6 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_stats_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_stats_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:00:00 - Midnight tasks
  IF current_hour = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.cleanup_queue_messages();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_queue_messages failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.delete_old_deleted_apps();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_old_deleted_apps failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.remove_old_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remove_old_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:40:00 - Old app version retention
  IF current_hour = 0 AND current_minute = 40 AND current_second = 0 THEN
    BEGIN
      PERFORM public.update_app_versions_retention();
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
      PERFORM public.process_free_trial_expired();
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

  -- Daily at 08:00:00 - Daily fail ratio email
  IF current_hour = 8 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_daily_fail_ratio_email();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_daily_fail_ratio_email failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 12:00:00 - Noon tasks
  IF current_hour = 12 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      DELETE FROM cron.job_run_details WHERE end_time < NOW() - interval '7 days';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup job_run_details failed: %', SQLERRM;
    END;

    -- Weekly stats email (every Saturday at noon)
    IF EXTRACT(DOW FROM NOW()) = 6 THEN
      BEGIN
        PERFORM public.process_stats_email_weekly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_weekly failed: %', SQLERRM;
      END;
    END IF;

    -- Monthly stats email (1st of month at noon)
    IF EXTRACT(DAY FROM NOW()) = 1 THEN
      BEGIN
        PERFORM public.process_stats_email_monthly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_monthly failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

COMMIT;
