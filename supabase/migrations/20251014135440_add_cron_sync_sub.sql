-- Add cron_sync_sub queue and scheduling system
-- Secure process_function_queue function to only allow privileged users
-- Remove public access and only allow service_role and postgres
-- Ensure the function is SECURITY DEFINER so it runs with elevated privileges
CREATE OR REPLACE FUNCTION "public"."process_function_queue" (
  "queue_name" "text",
  "batch_size" integer DEFAULT 950
) RETURNS bigint LANGUAGE "plpgsql" SECURITY DEFINER
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
REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer)
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer)
FROM
  "anon";

REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer)
FROM
  "authenticated";

-- Grant access only to service_role and postgres
GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text", "batch_size" integer) TO "postgres";

-- Create new message queue for cron_sync_sub
SELECT
  pgmq.create ('cron_sync_sub');

-- Create function to process all organizations for cron_sync_sub
CREATE OR REPLACE FUNCTION "public"."process_cron_sync_sub_jobs" () RETURNS "void" LANGUAGE "plpgsql"
SET
  "search_path" TO '' AS $$
DECLARE
    org_record RECORD;
BEGIN
    -- Process each organization that has a customer_id (paying customers only)
    FOR org_record IN 
        SELECT DISTINCT o.id, si.customer_id
        FROM public.orgs o
        INNER JOIN public.stripe_info si ON o.customer_id = si.customer_id
        WHERE o.customer_id IS NOT NULL 
          AND si.customer_id IS NOT NULL
    LOOP
        -- Queue sync_sub processing for this organization
        PERFORM pgmq.send('cron_sync_sub',
            json_build_object(
                'function_name', 'cron_sync_sub',
                'orgId', org_record.id,
                'customerId', org_record.customer_id
            )::jsonb
        );
    END LOOP;
END;
$$;

-- Set permissions for the new function
ALTER FUNCTION public.process_cron_sync_sub_jobs () OWNER TO postgres;

-- Revoke all existing permissions first
REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs ()
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs ()
FROM
  anon;

REVOKE ALL ON FUNCTION public.process_cron_sync_sub_jobs ()
FROM
  authenticated;

-- Grant only EXECUTE permission to service_role
GRANT
EXECUTE ON FUNCTION public.process_cron_sync_sub_jobs () TO service_role;

-- Create cron job for cron_sync_sub scheduling (daily at 4am)
SELECT
  cron.schedule (
    'cron_sync_sub_scheduler',
    '0 4 * * *',
    'SELECT public.process_cron_sync_sub_jobs();'
  );

-- Create cron job for processing cron_sync_sub queue (every minute) with batch size of 10
SELECT
  cron.schedule (
    'process_cron_sync_sub_queue',
    '* * * * *',
    'SELECT public.process_function_queue(''cron_sync_sub'', 10)'
  );
