-- Update process_all_cron_tasks() to include SSO audit log cleanup
-- Runs daily at 3:00 AM UTC (hour == 3, minute < 5) to delete logs older than 90 days
-- Per Capgo convention: do NOT use cron_tasks table, embed logic in process_all_cron_tasks()

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
  lock_acquired boolean;
BEGIN
  -- Try to acquire an advisory lock (non-blocking)
  -- Lock ID 1 is reserved for process_all_cron_tasks
  -- pg_try_advisory_lock returns true if lock acquired, false if already held
  lock_acquired := pg_try_advisory_lock(1);

  IF NOT lock_acquired THEN
    -- Another instance is already running, skip this execution
    RAISE NOTICE 'process_all_cron_tasks: skipped, another instance is already running';
    RETURN;
  END IF;

  -- Wrap everything in a block so we can ensure the lock is released
  BEGIN
    -- Get current time components in UTC
    current_hour := EXTRACT(HOUR FROM NOW());
    current_minute := EXTRACT(MINUTE FROM NOW());
    current_second := EXTRACT(SECOND FROM NOW());
    current_dow := EXTRACT(DOW FROM NOW());
    current_day := EXTRACT(DAY FROM NOW());

    -- =========================================================================
    -- SSO Audit Log Cleanup (Daily at 3:00 AM UTC)
    -- =========================================================================
    IF current_hour = 3 AND current_minute < 5 AND current_second < 10 THEN
      BEGIN
        PERFORM public.cleanup_old_sso_audit_logs();
        RAISE NOTICE 'SSO audit log cleanup completed successfully';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'SSO audit log cleanup failed: %', SQLERRM;
      END;
    END IF;

    -- =========================================================================
    -- Loop through all enabled cron_tasks
    -- =========================================================================
    FOR task IN SELECT * FROM public.cron_tasks WHERE enabled = true LOOP
      should_run := false;

      -- Check if task should run based on its schedule
      IF task.second_interval IS NOT NULL THEN
        -- Run every N seconds
        -- Since pg_cron interval is not clock-aligned, we run on every invocation
        -- for second_interval tasks (the cron job itself runs every 10 seconds)
        should_run := true;
      ELSIF task.minute_interval IS NOT NULL THEN
        -- Run every N minutes
        -- Use current_second < 10 to catch first run of each minute (works with any cron offset)
        should_run := (current_minute % task.minute_interval = 0)
                      AND (current_second < 10);
      ELSIF task.hour_interval IS NOT NULL THEN
        -- Run every N hours at specific minute
        -- Use current_second < 10 to catch first run
        should_run := (current_hour % task.hour_interval = 0)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);
      ELSIF task.run_at_hour IS NOT NULL THEN
        -- Run at specific time
        -- Use current_second < 10 to catch first run
        should_run := (current_hour = task.run_at_hour)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);

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
              -- Whitelist allowed functions for security
              IF task.target IN (
                'public.cleanup_old_sso_audit_logs',
                'public.cleanup_queue_messages',
                'public.cleanup_old_audit_logs',
                'public.process_stats_queue',
                'public.send_stats_email'
              ) THEN
                EXECUTE 'SELECT ' || task.target;
              ELSE
                RAISE WARNING 'Unknown or unauthorized function: %', task.target;
              END IF;

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

  EXCEPTION WHEN OTHERS THEN
    -- Release the lock even if an error occurred
    PERFORM pg_advisory_unlock(1);
    RAISE;
  END;

  -- Release the advisory lock
  PERFORM pg_advisory_unlock(1);
END;
$$;

-- Add comment explaining the SSO audit cleanup addition
COMMENT ON FUNCTION public.process_all_cron_tasks () IS 'Consolidated cron task processor that runs every 10 seconds. Uses advisory lock (ID=1) to prevent concurrent execution. Includes SSO audit log cleanup at 3:00 AM UTC daily.';