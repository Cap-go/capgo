-- create a new function who calls the https://sync.capgo.app/sync function every 1 sec with header x-webhook-signature: e8672f2f-491e-44fb-be83-b3d0210fac0b
-- using net.http_post

-- Remove the cron job for process_d1_replication_batch
SELECT cron.unschedule('process_d1_replication_batch');

CREATE OR REPLACE FUNCTION "public"."get_d1_webhook_signature"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='d1_webhook_signature';
$$;

ALTER FUNCTION "public"."get_d1_webhook_signature"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_d1_webhook_signature"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_d1_webhook_signature"() TO "service_role";

DROP FUNCTION IF EXISTS "public"."process_d1_replication_batch"();

CREATE OR REPLACE FUNCTION "public"."process_d1_replication_batch"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
  queue_size bigint;
  calls_needed int;
  i int;
BEGIN
  -- Check if the webhook signature is set
  IF get_d1_webhook_signature() IS NOT NULL THEN
    -- Get the queue size by counting rows in the table
    SELECT count(*) INTO queue_size
    FROM pgmq.q_replicate_data;

    -- Call the endpoint only if the queue is not empty
    IF queue_size > 0 THEN
      -- Calculate how many times to call the sync endpoint (1 call per 1000 items, max 10 calls)
      calls_needed := least(ceil(queue_size / 1000.0)::int, 10);

      -- Call the endpoint multiple times if needed
      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := 'https://sync.capgo.app/sync',
          headers := jsonb_build_object('x-webhook-signature', get_d1_webhook_signature())
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."process_d1_replication_batch"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_d1_replication_batch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_d1_replication_batch"() TO "service_role";

SELECT cron.schedule(
    'process_d1_replication_batch',
    '5 seconds',
    $$SELECT process_d1_replication_batch();$$
);


CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_d1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Queue the operation for batch processing
    IF get_d1_webhook_signature() IS NOT NULL THEN
      PERFORM pgmq.send('replicate_data', 
          jsonb_build_object(
              'record', to_jsonb(NEW),
              'old_record', to_jsonb(OLD),
              'type', TG_OP,
              'table', TG_TABLE_NAME
          )
      );
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."trigger_http_queue_post_to_function_d1"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1"() TO "service_role";
