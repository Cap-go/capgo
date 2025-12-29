-- Add orphan images cleanup to the existing queue processing system
-- Also introduces a table-driven approach for cron tasks to make them more maintainable

-- Create the queue for orphan image cleanup
SELECT pgmq.create('cron_clean_orphan_images');

-- Create enum for task types
DO $$ BEGIN
  CREATE TYPE public.cron_task_type AS ENUM (
    'function',           -- Call a SQL function directly
    'queue',              -- Send a message to a pgmq queue
    'function_queue'      -- Process a function queue with batch size
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the cron_tasks table
CREATE TABLE IF NOT EXISTS public.cron_tasks (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  task_type public.cron_task_type NOT NULL DEFAULT 'function',
  -- For 'function' type: the function to call (e.g., 'public.cleanup_queue_messages')
  -- For 'queue' type: the queue name to send message to
  -- For 'function_queue' type: array of queue names as JSON
  target text NOT NULL,
  -- Optional batch size for function_queue type
  batch_size int,
  -- Optional payload for queue type (as JSONB)
  payload jsonb,
  -- Schedule configuration
  second_interval int,        -- Run every N seconds (e.g., 10 for every 10 seconds)
  minute_interval int,        -- Run every N minutes (e.g., 5 for every 5 minutes)
  hour_interval int,          -- Run every N hours (e.g., 2 for every 2 hours)
  run_at_hour int,            -- Run at specific hour (0-23)
  run_at_minute int,          -- Run at specific minute (0-59)
  run_at_second int DEFAULT 0,-- Run at specific second (0-59)
  run_on_dow int,             -- Run on specific day of week (0=Sunday, 6=Saturday)
  run_on_day int,             -- Run on specific day of month (1-31)
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for enabled tasks
CREATE INDEX IF NOT EXISTS idx_cron_tasks_enabled ON public.cron_tasks(enabled) WHERE enabled = true;

-- Security: Restrict access to cron_tasks table to service_role only
REVOKE ALL ON public.cron_tasks FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.cron_tasks_id_seq FROM PUBLIC;
GRANT ALL ON public.cron_tasks TO service_role;
GRANT ALL ON SEQUENCE public.cron_tasks_id_seq TO service_role;
ALTER TABLE public.cron_tasks ENABLE ROW LEVEL SECURITY;

-- Insert all existing cron tasks
INSERT INTO public.cron_tasks (name, description, task_type, target, batch_size, second_interval, minute_interval, hour_interval, run_at_hour, run_at_minute, run_at_second, run_on_dow, run_on_day) VALUES
  -- Every 10 seconds: High-frequency queues
  ('high_frequency_queues', 'Process high-frequency event queues', 'function_queue',
   '["on_channel_update", "on_user_create", "on_user_update", "on_version_create", "on_version_delete", "on_version_update", "on_app_delete", "on_organization_create", "on_user_delete", "on_app_create", "credit_usage_alerts"]',
   NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

  ('channel_device_counts', 'Process channel device counts queue', 'function',
   'public.process_channel_device_counts_queue(1000)',
   NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

  -- Every minute
  ('delete_marked_accounts', 'Delete accounts marked for deletion', 'function',
   'public.delete_accounts_marked_for_deletion()',
   NULL, NULL, 1, NULL, NULL, NULL, 0, NULL, NULL),

  ('per_minute_queues', 'Process per-minute queues', 'function_queue',
   '["cron_sync_sub", "cron_stat_app"]',
   10, NULL, 1, NULL, NULL, NULL, 0, NULL, NULL),

  ('manifest_create_queue', 'Process manifest create queue', 'function_queue',
   '["on_manifest_create"]',
   NULL, NULL, 1, NULL, NULL, NULL, 0, NULL, NULL),

  ('orphan_images_queue', 'Process orphan images cleanup queue', 'function_queue',
   '["cron_clean_orphan_images"]',
   NULL, NULL, 1, NULL, NULL, NULL, 0, NULL, NULL),

  -- Every 5 minutes
  ('org_stats_queue', 'Process org stats queue', 'function_queue',
   '["cron_stat_org"]',
   10, NULL, 5, NULL, NULL, NULL, 0, NULL, NULL),

  -- Every hour
  ('cleanup_job_details', 'Cleanup frequent job details', 'function',
   'public.cleanup_frequent_job_details()',
   NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL),

  ('deploy_install_stats_email', 'Process deploy install stats email', 'function',
   'public.process_deploy_install_stats_email()',
   NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL),

  -- Every 2 hours
  ('low_frequency_queues', 'Process low-frequency queues', 'function_queue',
   '["admin_stats", "cron_email", "on_organization_delete", "on_deploy_history_create", "cron_clear_versions"]',
   NULL, NULL, NULL, 2, NULL, 0, 0, NULL, NULL),

  -- Every 6 hours
  ('stats_jobs', 'Process cron stats jobs', 'function',
   'public.process_cron_stats_jobs()',
   NULL, NULL, NULL, 6, NULL, 0, 0, NULL, NULL),

  -- Daily at 00:00:00
  ('cleanup_queue_messages', 'Cleanup old queue messages', 'function',
   'public.cleanup_queue_messages()',
   NULL, NULL, NULL, NULL, 0, 0, 0, NULL, NULL),

  ('delete_old_apps', 'Delete old deleted apps', 'function',
   'public.delete_old_deleted_apps()',
   NULL, NULL, NULL, NULL, 0, 0, 0, NULL, NULL),

  ('remove_old_jobs', 'Remove old cron jobs', 'function',
   'public.remove_old_jobs()',
   NULL, NULL, NULL, NULL, 0, 0, 0, NULL, NULL),

  -- Daily at 00:40:00
  ('version_retention', 'Update app versions retention', 'function',
   'public.update_app_versions_retention()',
   NULL, NULL, NULL, NULL, 0, 40, 0, NULL, NULL),

  -- Daily at 01:01:00
  ('admin_stats', 'Process admin stats', 'function',
   'public.process_admin_stats()',
   NULL, NULL, NULL, NULL, 1, 1, 0, NULL, NULL),

  -- Daily at 03:00:00
  ('free_trial_expired', 'Process free trial expired', 'function',
   'public.process_free_trial_expired()',
   NULL, NULL, NULL, NULL, 3, 0, 0, NULL, NULL),

  ('expire_credits', 'Expire usage credits', 'function',
   'public.expire_usage_credits()',
   NULL, NULL, NULL, NULL, 3, 0, 0, NULL, NULL),

  -- Weekly on Sunday at 03:00:00
  ('orphan_images_cleanup', 'Queue orphan images cleanup job', 'queue',
   'cron_clean_orphan_images',
   NULL, NULL, NULL, NULL, 3, 0, 0, 0, NULL),

  -- Daily at 04:00:00
  ('sync_sub_jobs', 'Process cron sync sub jobs', 'function',
   'public.process_cron_sync_sub_jobs()',
   NULL, NULL, NULL, NULL, 4, 0, 0, NULL, NULL),

  -- Daily at 12:00:00
  ('cleanup_job_run_details', 'Cleanup old job run details', 'function',
   'public.cleanup_job_run_details_7days()',
   NULL, NULL, NULL, NULL, 12, 0, 0, NULL, NULL),

  -- Weekly on Saturday at 12:00:00
  ('weekly_stats_email', 'Process weekly stats email', 'function',
   'public.process_stats_email_weekly()',
   NULL, NULL, NULL, NULL, 12, 0, 0, 6, NULL),

  -- Monthly on 1st at 12:00:00
  ('monthly_stats_email', 'Process monthly stats email', 'function',
   'public.process_stats_email_monthly()',
   NULL, NULL, NULL, NULL, 12, 0, 0, NULL, 1)
ON CONFLICT (name) DO NOTHING;

-- Create helper function to cleanup job run details (extracted from inline SQL)
CREATE OR REPLACE FUNCTION public.cleanup_job_run_details_7days() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
END;
$$;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.cleanup_job_run_details_7days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_job_run_details_7days() TO service_role;

-- Create the new table-driven process_all_cron_tasks function
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks() RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
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
      should_run := (current_second % task.second_interval = 0);
    ELSIF task.minute_interval IS NOT NULL THEN
      -- Run every N minutes at specific second
      should_run := (current_minute % task.minute_interval = 0)
                    AND (current_second = COALESCE(task.run_at_second, 0));
    ELSIF task.hour_interval IS NOT NULL THEN
      -- Run every N hours at specific minute and second
      should_run := (current_hour % task.hour_interval = 0)
                    AND (current_minute = COALESCE(task.run_at_minute, 0))
                    AND (current_second = COALESCE(task.run_at_second, 0));
    ELSIF task.run_at_hour IS NOT NULL THEN
      -- Run at specific time
      should_run := (current_hour = task.run_at_hour)
                    AND (current_minute = COALESCE(task.run_at_minute, 0))
                    AND (current_second = COALESCE(task.run_at_second, 0));

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
END;
$$;

-- Security: internal function only
REVOKE EXECUTE ON FUNCTION public.process_all_cron_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_all_cron_tasks() TO service_role;
