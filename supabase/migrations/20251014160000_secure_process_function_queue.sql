-- Secure process_function_queue function to only allow privileged users
-- Remove public access and only allow service_role and postgres

-- Ensure the function is SECURITY DEFINER so it runs with elevated privileges
CREATE OR REPLACE FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer DEFAULT 950) RETURNS bigint LANGUAGE "plpgsql"
SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed int;
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
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name, 'batch_size', batch_size),
        timeout_milliseconds := 15000
      );
    END LOOP;

    -- Return the number of calls made
    RETURN calls_needed::bigint;
  END IF;

  RETURN 0::bigint;
END;
$$;

ALTER FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) OWNER TO "postgres";

-- Revoke all existing permissions
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) FROM "authenticated";

-- Grant access only to service_role and postgres
GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "postgres";
