BEGIN;

ALTER TABLE public.deploy_history
ADD COLUMN IF NOT EXISTS install_stats_email_sent_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.process_deploy_install_stats_email () RETURNS void LANGUAGE plpgsql
SET
  search_path = '' AS $$
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

ALTER FUNCTION public.process_deploy_install_stats_email () OWNER TO postgres;

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
END;
$$;

COMMIT;
