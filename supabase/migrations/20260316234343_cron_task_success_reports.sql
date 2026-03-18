ALTER TABLE public.cron_tasks
ADD COLUMN IF NOT EXISTS success_report_url text;

CREATE TABLE IF NOT EXISTS public.cron_task_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cron_task_id integer NOT NULL REFERENCES public.cron_tasks(id) ON DELETE CASCADE,
    task_name text NOT NULL,
    task_type public.cron_task_type NOT NULL,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    success_report_url text,
    expected_batches integer NOT NULL DEFAULT 1 CHECK (expected_batches >= 0),
    completed_batches integer NOT NULL DEFAULT 0 CHECK (completed_batches >= 0),
    failed_batches integer NOT NULL DEFAULT 0 CHECK (failed_batches >= 0),
    last_error text,
    report_queued_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cron_task_runs_status_created_at
ON public.cron_task_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_task_runs_cron_task_id_created_at
ON public.cron_task_runs(cron_task_id, created_at DESC);

REVOKE ALL ON public.cron_task_runs FROM public;
GRANT ALL ON public.cron_task_runs TO service_role;
ALTER TABLE public.cron_task_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access" ON public.cron_task_runs;
CREATE POLICY "Deny all access" ON public.cron_task_runs FOR ALL USING (false);

SELECT pgmq.create('cron_success_report');

CREATE OR REPLACE FUNCTION public.queue_cron_success_report(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run_record public.cron_task_runs%ROWTYPE;
BEGIN
  SELECT *
  INTO run_record
  FROM public.cron_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF run_record.status <> 'success'
     OR run_record.success_report_url IS NULL
     OR run_record.report_queued_at IS NOT NULL THEN
    RETURN;
  END IF;

  PERFORM pgmq.send(
    'cron_success_report',
    jsonb_build_object(
      'runId', run_record.id,
      'taskName', run_record.task_name,
      'url', run_record.success_report_url,
      'function_name', 'cron_success_report',
      'payload', jsonb_build_object(
        'runId', run_record.id,
        'taskName', run_record.task_name,
        'url', run_record.success_report_url
      )
    )
  );

  UPDATE public.cron_task_runs
  SET report_queued_at = NOW(),
      updated_at = NOW()
  WHERE id = run_record.id;
END;
$$;

ALTER FUNCTION public.queue_cron_success_report(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.queue_cron_success_report(uuid) FROM public;
REVOKE ALL ON FUNCTION public.queue_cron_success_report(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.queue_cron_success_report(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_cron_success_report(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.process_cron_success_report_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  headers jsonb;
  url text;
  queue_size bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM pgmq.q_cron_success_report' INTO queue_size;

  IF queue_size = 0 THEN
    RETURN;
  END IF;

  -- Process a single capped batch every 10 seconds.
  -- This keeps deliveries under Hyperping's 300 pings/minute per IP limit.
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apisecret', public.get_apikey()
  );
  url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

  PERFORM net.http_post(
    url := url,
    headers := headers,
    body := jsonb_build_object(
      'queue_name', 'cron_success_report',
      'batch_size', 40
    ),
    timeout_milliseconds := 8000
  );
END;
$$;

ALTER FUNCTION public.process_cron_success_report_queue() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_cron_success_report_queue() FROM public;
REVOKE ALL ON FUNCTION public.process_cron_success_report_queue() FROM anon;
REVOKE ALL ON FUNCTION public.process_cron_success_report_queue() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_cron_success_report_queue() TO service_role;

CREATE OR REPLACE FUNCTION public.process_function_queue(
  queue_name text,
  batch_size integer,
  p_run_id uuid,
  p_cron_task_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM pgmq.q_%I', queue_name) INTO queue_size;

  IF queue_size > 0 THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';
    calls_needed := least(ceil(queue_size / batch_size::float)::int, 10);

    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object(
          'queue_name', queue_name,
          'batch_size', batch_size,
          'cron_run_id', p_run_id,
          'cron_task_name', p_cron_task_name
        ),
        timeout_milliseconds := 8000
      );
    END LOOP;

    RETURN calls_needed;
  END IF;

  RETURN 0;
END;
$$;

ALTER FUNCTION public.process_function_queue(text, integer, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_function_queue(text, integer, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.process_function_queue(text, integer, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_function_queue(text, integer, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_function_queue(text, integer, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.process_function_queue_with_run(
  queue_names text[],
  batch_size integer,
  p_run_id uuid,
  p_cron_task_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  queue_name text;
  queue_calls integer;
  total_calls integer := 0;
  had_error boolean := false;
BEGIN
  FOREACH queue_name IN ARRAY queue_names LOOP
    BEGIN
      queue_calls := public.process_function_queue(
        queue_name,
        batch_size,
        p_run_id,
        p_cron_task_name
      );
      total_calls := total_calls + COALESCE(queue_calls, 0);
    EXCEPTION WHEN OTHERS THEN
      had_error := true;
      RAISE WARNING 'process_function_queue failed for queue "%": %', queue_name, SQLERRM;
    END;
  END LOOP;

  IF had_error THEN
    RAISE EXCEPTION 'process_function_queue_with_run_failed';
  END IF;

  RETURN total_calls;
END;
$$;

ALTER FUNCTION public.process_function_queue_with_run(text[], integer, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_function_queue_with_run(text[], integer, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.process_function_queue_with_run(text[], integer, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_function_queue_with_run(text[], integer, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_function_queue_with_run(text[], integer, uuid, text) TO service_role;

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
  run_id uuid;
  total_batches integer;
BEGIN
  lock_acquired := pg_try_advisory_lock(1);

  IF NOT lock_acquired THEN
    RAISE NOTICE 'process_all_cron_tasks: skipped, another instance is already running';
    RETURN;
  END IF;

  BEGIN
    current_hour := EXTRACT(HOUR FROM NOW());
    current_minute := EXTRACT(MINUTE FROM NOW());
    current_second := EXTRACT(SECOND FROM NOW());
    current_dow := EXTRACT(DOW FROM NOW());
    current_day := EXTRACT(DAY FROM NOW());

    FOR task IN SELECT * FROM public.cron_tasks WHERE enabled = true LOOP
      should_run := false;

      IF task.second_interval IS NOT NULL THEN
        should_run := true;
      ELSIF task.minute_interval IS NOT NULL THEN
        should_run := (current_minute % task.minute_interval = 0)
                      AND (current_second < 10);
      ELSIF task.hour_interval IS NOT NULL THEN
        should_run := (current_hour % task.hour_interval = 0)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);
      ELSIF task.run_at_hour IS NOT NULL THEN
        should_run := (current_hour = task.run_at_hour)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);

        IF should_run AND task.run_on_dow IS NOT NULL THEN
          should_run := (current_dow = task.run_on_dow);
        END IF;

        IF should_run AND task.run_on_day IS NOT NULL THEN
          should_run := (current_day = task.run_on_day);
        END IF;
      END IF;

      IF should_run THEN
        run_id := gen_random_uuid();

        INSERT INTO public.cron_task_runs (
          id,
          cron_task_id,
          task_name,
          task_type,
          status,
          success_report_url,
          expected_batches
        )
        VALUES (
          run_id,
          task.id,
          task.name,
          task.task_type,
          'running',
          task.success_report_url,
          CASE WHEN task.task_type = 'function' THEN 1 ELSE 0 END
        );

        BEGIN
          CASE task.task_type
            WHEN 'function' THEN
              EXECUTE 'SELECT ' || task.target;

              UPDATE public.cron_task_runs
              SET status = 'success',
                  expected_batches = 1,
                  completed_batches = 1,
                  failed_batches = 0,
                  finished_at = NOW(),
                  updated_at = NOW()
              WHERE id = run_id;

              PERFORM public.queue_cron_success_report(run_id);

            WHEN 'queue' THEN
              PERFORM pgmq.send(
                task.target,
                COALESCE(task.payload, jsonb_build_object('function_name', task.target))
                || jsonb_build_object(
                  '__cron_run_id', run_id,
                  '__cron_task_name', task.name
                )
              );

              UPDATE public.cron_task_runs
              SET expected_batches = 1,
                  updated_at = NOW()
              WHERE id = run_id;

            WHEN 'function_queue' THEN
              SELECT array_agg(value::text) INTO queue_names
              FROM jsonb_array_elements_text(task.target::jsonb);

              total_batches := public.process_function_queue_with_run(
                queue_names,
                COALESCE(task.batch_size, 950),
                run_id,
                task.name
              );

              IF total_batches = 0 THEN
                UPDATE public.cron_task_runs
                SET status = 'success',
                    expected_batches = 0,
                    completed_batches = 0,
                    failed_batches = 0,
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE id = run_id;

                PERFORM public.queue_cron_success_report(run_id);
              ELSE
                UPDATE public.cron_task_runs
                SET expected_batches = total_batches,
                    updated_at = NOW()
                WHERE id = run_id;
              END IF;
          END CASE;
        EXCEPTION WHEN OTHERS THEN
          UPDATE public.cron_task_runs
          SET status = 'failed',
              failed_batches = GREATEST(failed_batches, 1),
              last_error = SQLERRM,
              finished_at = NOW(),
              updated_at = NOW()
          WHERE id = run_id;

          RAISE WARNING 'cron task "%" failed: %', task.name, SQLERRM;
        END;
      END IF;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(1);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(1);
END;
$$;

COMMENT ON FUNCTION public.process_all_cron_tasks() IS 'Consolidated cron task processor that runs every 10 seconds. Uses advisory lock (ID=1) to prevent concurrent execution - if a previous run is still executing, the new invocation will skip. Successful tasks may enqueue generic success-report webhooks.';

INSERT INTO public.cron_tasks (
    name,
    description,
    task_type,
    target,
    second_interval,
    enabled
)
VALUES (
    'cron_success_report_queue',
    'Deliver queued cron success reports',
    'function',
    'public.process_cron_success_report_queue()',
    10,
    true
)
ON CONFLICT (name) DO UPDATE SET
    description = excluded.description,
    task_type = excluded.task_type,
    target = excluded.target,
    second_interval = excluded.second_interval,
    enabled = excluded.enabled,
    updated_at = NOW();
