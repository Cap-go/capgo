DO $$
BEGIN
  UPDATE "public"."cron_tasks"
  SET
    "second_interval" = 10,
    "minute_interval" = NULL,
    "batch_size" = 950,
    "updated_at" = "now"()
  WHERE "name" = 'manifest_create_queue';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cron_tasks row with name = manifest_create_queue not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_function_queue(
    queue_name text,
    batch_size integer DEFAULT 950
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  calls_needed int;
  headers jsonb;
  queue_size bigint;
  request_timeout_ms int;
  url text;
BEGIN
  EXECUTE pg_catalog.format('SELECT count(*) FROM pgmq.%I', 'q_' || queue_name)
  INTO queue_size;

  IF queue_size > 0 THEN
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    request_timeout_ms := CASE
      WHEN queue_name = 'on_manifest_create' THEN 60000
      ELSE 8000
    END;
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    calls_needed := LEAST(
      pg_catalog.ceil(queue_size / batch_size::double precision)::int,
      10
    );

    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := pg_catalog.jsonb_build_object(
          'queue_name', queue_name,
          'batch_size', batch_size
        ),
        timeout_milliseconds := request_timeout_ms
      );
    END LOOP;
  END IF;
END;
$$;

ALTER FUNCTION public.process_function_queue(text, integer) OWNER TO postgres;

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
  request_timeout_ms int;
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

      request_timeout_ms := CASE
        WHEN queue_name = 'on_manifest_create' THEN 60000
        ELSE 8000
      END;

      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := url,
          headers := headers,
          body := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'queue_name', queue_name,
            'batch_size', batch_size,
            'healthcheck_url', healthcheck_url
          )),
          timeout_milliseconds := request_timeout_ms
        );
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_queue_with_healthcheck failed for queue "%": %',
        queue_name,
        SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION public.process_queue_with_healthcheck(text [], integer, text)
OWNER TO postgres;
