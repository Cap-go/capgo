ALTER TABLE public.cron_tasks
ADD COLUMN IF NOT EXISTS healthcheck_url text;

CREATE OR REPLACE FUNCTION public.process_queue_with_healthcheck(
    queue_names text [],
    batch_size integer,
    healthcheck_url text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  calls_needed int;
  headers jsonb;
  queue_name text;
  queue_size bigint;
  url text;
BEGIN
  IF batch_size IS NULL OR batch_size <= 0 THEN
    RAISE EXCEPTION 'batch_size must be positive';
  END IF;

  headers := pg_catalog.jsonb_build_object(
    'Content-Type', 'application/json',
    'apisecret', public.get_apikey()
  );
  url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

  FOREACH queue_name IN ARRAY queue_names LOOP
    BEGIN
      EXECUTE pg_catalog.format('SELECT count(*) FROM pgmq.%I', 'q_' || queue_name)
      INTO queue_size;

      IF queue_size > 0 THEN
        calls_needed := LEAST(
          pg_catalog.ceil(queue_size / batch_size::double precision)::int,
          10
        );
      ELSE
        calls_needed := 1;
      END IF;

      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := url,
          headers := headers,
          body := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'queue_name', queue_name,
            'batch_size', batch_size,
            'healthcheck_url', healthcheck_url
          )),
          timeout_milliseconds := 8000
        );
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_queue_with_healthcheck failed for queue "%": %', queue_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) FROM public;
REVOKE ALL ON FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) FROM anon;
REVOKE ALL ON FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.process_queue_with_healthcheck(
    text [], integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.process_all_cron_tasks()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
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

    -- Loop through all enabled tasks
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

              IF task.healthcheck_url IS NOT NULL THEN
                PERFORM public.process_queue_with_healthcheck(
                  COALESCE(queue_names, ARRAY[]::text[]),
                  COALESCE(task.batch_size, 950),
                  task.healthcheck_url
                );
              ELSIF task.batch_size IS NOT NULL THEN
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

ALTER FUNCTION public.process_all_cron_tasks() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM public;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM anon;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM authenticated;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM service_role;
GRANT EXECUTE ON FUNCTION public.process_all_cron_tasks() TO service_role;

COMMENT ON FUNCTION public.process_all_cron_tasks() IS
$$Consolidated cron task processor that runs every 10 seconds. Uses advisory
lock (ID=1) to prevent concurrent execution - if a previous run is still
executing, the new invocation will skip.$$;
