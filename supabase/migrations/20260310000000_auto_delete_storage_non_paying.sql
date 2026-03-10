-- Migration: Auto-delete storage for non-paying accounts (30+ days)
-- Sends email reminders at 7, 3, 1 days before deletion
-- Ref: GitHub Issue #1149

-- Create table to track orgs scheduled for storage deletion
CREATE TABLE public.storage_deletion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  scheduled_deletion_date TIMESTAMPTZ NOT NULL,
  warning_7d_sent BOOLEAN NOT NULL DEFAULT false,
  warning_3d_sent BOOLEAN NOT NULL DEFAULT false,
  warning_1d_sent BOOLEAN NOT NULL DEFAULT false,
  storage_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX storage_deletion_queue_org_id_key ON public.storage_deletion_queue (org_id);
CREATE INDEX storage_deletion_queue_deletion_date_idx ON public.storage_deletion_queue (scheduled_deletion_date);

ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access" ON public.storage_deletion_queue FOR ALL USING (false) WITH CHECK (false);

GRANT ALL ON TABLE public.storage_deletion_queue TO service_role;
GRANT ALL ON TABLE public.storage_deletion_queue TO postgres;

-- Create the pgmq queue for storage deletion jobs
SELECT pgmq.create('cron_delete_storage');

-- Function to process storage deletion for non-paying accounts
-- Runs daily: schedules new deletions, sends warnings, and queues actual deletion jobs
CREATE OR REPLACE FUNCTION "public"."process_storage_deletion_non_paying"()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  org_record RECORD;
  deletion_date TEXT;
BEGIN
  -- 1. Cancel scheduled deletions for orgs that have resubscribed
  DELETE FROM public.storage_deletion_queue sdq
  WHERE sdq.storage_deleted = false
    AND EXISTS (
      SELECT 1
      FROM public.orgs o
      INNER JOIN public.stripe_info si ON si.customer_id = o.customer_id
      WHERE o.id = sdq.org_id
        AND si.status = 'succeeded'
        AND si.is_good_plan = true
    );

  -- 2. Schedule deletions for newly canceled orgs (not yet in queue)
  INSERT INTO public.storage_deletion_queue (org_id, scheduled_deletion_date)
  SELECT
    o.id,
    si.canceled_at + INTERVAL '30 days'
  FROM public.orgs o
  INNER JOIN public.stripe_info si ON si.customer_id = o.customer_id
  WHERE si.status = 'canceled'
    AND si.canceled_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.storage_deletion_queue sdq WHERE sdq.org_id = o.id
    )
  ON CONFLICT (org_id) DO NOTHING;

  -- 3. Send 7-day warning emails (when deletion is within 7 days and warning not yet sent)
  -- Uses inclusive threshold: catches up on any missed warnings from delayed runs
  FOR org_record IN (
    SELECT sdq.org_id, sdq.scheduled_deletion_date, o.management_email
    FROM public.storage_deletion_queue sdq
    INNER JOIN public.orgs o ON o.id = sdq.org_id
    WHERE sdq.warning_7d_sent = false
      AND sdq.storage_deleted = false
      AND sdq.scheduled_deletion_date > NOW()
      AND sdq.scheduled_deletion_date <= NOW() + INTERVAL '7 days'
  )
  LOOP
    deletion_date := org_record.scheduled_deletion_date::date::text;
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', org_record.management_email,
          'orgId', org_record.org_id,
          'type', 'storage_deletion_warning',
          'daysBefore', 7,
          'deletionDate', deletion_date
        )
      )
    );
    UPDATE public.storage_deletion_queue
    SET warning_7d_sent = true
    WHERE org_id = org_record.org_id;
  END LOOP;

  -- 4. Send 3-day warning emails
  FOR org_record IN (
    SELECT sdq.org_id, sdq.scheduled_deletion_date, o.management_email
    FROM public.storage_deletion_queue sdq
    INNER JOIN public.orgs o ON o.id = sdq.org_id
    WHERE sdq.warning_3d_sent = false
      AND sdq.storage_deleted = false
      AND sdq.scheduled_deletion_date > NOW()
      AND sdq.scheduled_deletion_date <= NOW() + INTERVAL '3 days'
  )
  LOOP
    deletion_date := org_record.scheduled_deletion_date::date::text;
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', org_record.management_email,
          'orgId', org_record.org_id,
          'type', 'storage_deletion_warning',
          'daysBefore', 3,
          'deletionDate', deletion_date
        )
      )
    );
    UPDATE public.storage_deletion_queue
    SET warning_3d_sent = true
    WHERE org_id = org_record.org_id;
  END LOOP;

  -- 5. Send 1-day warning emails
  FOR org_record IN (
    SELECT sdq.org_id, sdq.scheduled_deletion_date, o.management_email
    FROM public.storage_deletion_queue sdq
    INNER JOIN public.orgs o ON o.id = sdq.org_id
    WHERE sdq.warning_1d_sent = false
      AND sdq.storage_deleted = false
      AND sdq.scheduled_deletion_date > NOW()
      AND sdq.scheduled_deletion_date <= NOW() + INTERVAL '1 day'
  )
  LOOP
    deletion_date := org_record.scheduled_deletion_date::date::text;
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', org_record.management_email,
          'orgId', org_record.org_id,
          'type', 'storage_deletion_warning',
          'daysBefore', 1,
          'deletionDate', deletion_date
        )
      )
    );
    UPDATE public.storage_deletion_queue
    SET warning_1d_sent = true
    WHERE org_id = org_record.org_id;
  END LOOP;

  -- 6. Queue actual storage deletion for orgs past their deletion date
  FOR org_record IN (
    SELECT sdq.org_id, o.management_email
    FROM public.storage_deletion_queue sdq
    INNER JOIN public.orgs o ON o.id = sdq.org_id
    WHERE sdq.storage_deleted = false
      AND sdq.scheduled_deletion_date <= NOW()
  )
  LOOP
    PERFORM pgmq.send('cron_delete_storage',
      jsonb_build_object(
        'function_name', 'cron_delete_storage',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_record.org_id
        )
      )
    );
    UPDATE public.storage_deletion_queue
    SET storage_deleted = true
    WHERE org_id = org_record.org_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION "public"."process_storage_deletion_non_paying"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."process_storage_deletion_non_paying"() FROM anon;
REVOKE ALL ON FUNCTION "public"."process_storage_deletion_non_paying"() FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."process_storage_deletion_non_paying"() TO postgres;
GRANT EXECUTE ON FUNCTION "public"."process_storage_deletion_non_paying"() TO service_role;

-- Update process_all_cron_tasks to include storage deletion processing (daily at 02:00)
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks () RETURNS void LANGUAGE plpgsql
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
      PERFORM public.cleanup_frequent_job_details();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_frequent_job_details failed: %', SQLERRM;
    END;
  END IF;

  -- Every 2 hours (at :00:00): Low-frequency queues with default batch size
  IF current_hour % 2 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_version_create', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions', 'cron_delete_storage']);
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

  -- Daily at 02:00:00 - Storage deletion for non-paying accounts
  IF current_hour = 2 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_storage_deletion_non_paying();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_storage_deletion_non_paying failed: %', SQLERRM;
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
