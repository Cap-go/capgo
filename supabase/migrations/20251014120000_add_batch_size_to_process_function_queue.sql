-- Add batch_size parameter to process_function_queue function
CREATE OR REPLACE FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer DEFAULT 950) RETURNS bigint LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  request_id text;
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed int;
  i int;
BEGIN
  -- Check if the queue has elements
  EXECUTE format('SELECT count(*) FROM pgmq.q_%I', queue_name) INTO queue_size;

  -- Only make the HTTP request if the queue is not empty
  IF queue_size > 0 THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    -- Calculate how many times to call the sync endpoint (1 call per batch_size items, max 10 calls)
    calls_needed := least(ceil(queue_size / batch_size::float)::int, 10);

    -- Call the endpoint multiple times if needed
    FOR i IN 1..calls_needed LOOP
      SELECT INTO request_id net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name, 'batch_size', batch_size),
        timeout_milliseconds := 15000
      );
    END LOOP;

    RETURN request_id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "service_role";
