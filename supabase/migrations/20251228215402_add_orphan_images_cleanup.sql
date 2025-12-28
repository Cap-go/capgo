-- Add orphan images cleanup to the existing queue processing system
-- This adds the cron_clean_orphan_images queue to be processed weekly

-- Create the queue for orphan image cleanup
SELECT pgmq.create('cron_clean_orphan_images');

-- Update process_combined_cron_jobs to include orphan image cleanup
-- This is based on the latest version from 20251228033417_webhooks.sql
-- Only adding: weekly orphan image cleanup on Sunday at 03:00
CREATE OR REPLACE FUNCTION "public"."process_combined_cron_jobs"() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_create', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create', 'credit_usage_alerts', 'webhook_dispatcher', 'webhook_delivery']);
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
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_version_create', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions']);
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

    -- Cleanup old webhook deliveries (7 days retention)
    BEGIN
      PERFORM public.cleanup_webhook_deliveries();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_webhook_deliveries failed: %', SQLERRM;
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

  -- Daily at 03:00:00 - Free trial, credits, audit log cleanup, and orphan images
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

    -- Weekly on Sunday: Orphan images cleanup
    IF EXTRACT(DOW FROM now()) = 0 THEN
      BEGIN
        PERFORM pgmq.send(
          'cron_clean_orphan_images',
          jsonb_build_object('function_name', 'cron_clean_orphan_images')
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'queue cron_clean_orphan_images failed: %', SQLERRM;
      END;
    END IF;
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

  -- Process cron_clean_orphan_images queue every minute (will only have messages on Sunday)
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_clean_orphan_images']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (cron_clean_orphan_images) failed: %', SQLERRM;
    END;
  END IF;

END;
$$;

ALTER FUNCTION "public"."process_combined_cron_jobs"() OWNER TO "postgres";
