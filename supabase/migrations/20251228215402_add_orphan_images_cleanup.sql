-- Add orphan images cleanup to the existing queue processing system
-- This adds the cron_clean_orphan_images queue to be processed weekly

-- Create the queue for orphan image cleanup
SELECT pgmq.create('cron_clean_orphan_images');

-- Update process_combined_cron_jobs to include orphan image cleanup
-- Run weekly on Sunday at 03:00:00
CREATE OR REPLACE FUNCTION "public"."process_combined_cron_jobs"() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  current_hour int := EXTRACT(HOUR FROM NOW());
  current_minute int := EXTRACT(MINUTE FROM NOW());
  current_second int := EXTRACT(SECOND FROM NOW());
  current_dow int := EXTRACT(DOW FROM NOW()); -- 0 = Sunday
BEGIN
  -- Every 5 seconds: High-frequency queues
  IF current_second % 5 = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_create', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create', 'credit_usage_alerts']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (high-frequency) failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.process_webhook_queue(100);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_webhook_queue failed: %', SQLERRM;
    END;
  END IF;

  -- Every minute (at :00): Per-minute queues with batch size of 10
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_sync_sub', 'cron_stat_app'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (per-minute) failed: %', SQLERRM;
    END;

    -- Process on_manifest_create queue every minute
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_manifest_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (manifest_create) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 5 minutes (at :00:00, :05:00, etc.): cron_stat_org queue
  IF current_minute % 5 = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_stat_org'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (cron_stat_org) failed: %', SQLERRM;
    END;
  END IF;

  -- Every hour (at :01:00): Cleanup frequent job details and send deploy emails
  IF current_minute = 1 AND current_second = 0 THEN
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
      PERFORM public.queue_admin_stats_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue_admin_stats_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 03:00:00 - cron_sync_sub jobs
  IF current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_sync_sub_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_sync_sub_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Weekly on Sunday at 03:00:00 - Orphan images cleanup
  IF current_dow = 0 AND current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM pgmq.send(
        'cron_clean_orphan_images',
        jsonb_build_object('function_name', 'cron_clean_orphan_images')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'queue cron_clean_orphan_images failed: %', SQLERRM;
    END;
  END IF;

  -- Process cron_clean_orphan_images queue (check every minute, will only have messages on Sunday)
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
