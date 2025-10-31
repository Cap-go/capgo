-- LibSQL Replication Setup
-- This migration creates the infrastructure for replicating data to LibSQL (BunnyDB)
-- Separate from D1 replication to allow independent sync workflows

-- Create function to get LibSQL sync URL from vault
CREATE OR REPLACE FUNCTION "public"."get_libsql_sync_url" () RETURNS "text" LANGUAGE "sql"
SET
  search_path = '' STABLE SECURITY DEFINER PARALLEL SAFE AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='libsql_sync_url';
$$;

ALTER FUNCTION "public"."get_libsql_sync_url" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_libsql_sync_url" () FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_libsql_sync_url" () TO "anon";
GRANT ALL ON FUNCTION "public"."get_libsql_sync_url" () TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_libsql_sync_url" () TO "service_role";

-- Create function to get LibSQL webhook signature from vault
CREATE OR REPLACE FUNCTION "public"."get_libsql_webhook_signature" () RETURNS "text" LANGUAGE "sql"
SET
  search_path = '' STABLE SECURITY DEFINER PARALLEL SAFE AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='libsql_webhook_signature';
$$;

ALTER FUNCTION "public"."get_libsql_webhook_signature" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_libsql_webhook_signature" () FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_libsql_webhook_signature" () TO "anon";
GRANT ALL ON FUNCTION "public"."get_libsql_webhook_signature" () TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_libsql_webhook_signature" () TO "service_role";

-- Create trigger function for LibSQL replication
-- This queues INSERT, UPDATE, DELETE operations for batch processing
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    -- Queue the operation for batch processing
    IF public.get_libsql_webhook_signature() IS NOT NULL THEN
      PERFORM pgmq.send('replicate_data_libsql',
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

ALTER FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_libsql" () TO "service_role";

-- Create function to process LibSQL replication batch
-- This calls the LibSQL sync endpoint with the webhook signature
CREATE OR REPLACE FUNCTION "public"."process_libsql_replication_batch" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  webhook_url text;
  webhook_signature text;
  queue_size bigint;
  calls_needed int;
  i int;
BEGIN
  -- Get URL and signature from vault
  webhook_url := public.get_libsql_sync_url();
  webhook_signature := public.get_libsql_webhook_signature();

  -- Check if both URL and signature are set
  IF webhook_url IS NOT NULL AND webhook_signature IS NOT NULL THEN
    -- Get the queue size by counting rows in the table
    SELECT count(*) INTO queue_size
    FROM pgmq.q_replicate_data_libsql;

    -- Call the endpoint only if the queue is not empty
    IF queue_size > 0 THEN
      -- Calculate how many times to call the sync endpoint (1 call per 1000 items, max 10 calls)
      calls_needed := least(ceil(queue_size / 1000.0)::int, 10);

      -- Call the endpoint multiple times if needed
      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := webhook_url,
          headers := jsonb_build_object('x-webhook-signature', webhook_signature)
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."process_libsql_replication_batch" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."process_libsql_replication_batch" () FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_libsql_replication_batch" () TO "anon";
GRANT ALL ON FUNCTION "public"."process_libsql_replication_batch" () TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_libsql_replication_batch" () TO "service_role";

-- Create the PGMQ queue for LibSQL replication
SELECT pgmq.create ('replicate_data_libsql');

-- Create triggers on all relevant tables to replicate to LibSQL
-- These are the same tables as D1 sync: app_versions, channels, channel_devices, apps, orgs, stripe_info, manifest

CREATE OR REPLACE TRIGGER "replicate_app_versions_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."app_versions"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_apps_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."apps"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_channel_devices_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."channel_devices"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_channels_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."channels"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_manifest_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."manifest"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_orgs_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

CREATE OR REPLACE TRIGGER "replicate_stripe_info_libsql"
AFTER INSERT OR UPDATE OR DELETE ON "public"."stripe_info"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_libsql" ();

-- Create a cron job to process the LibSQL replication queue every 5 minutes
-- This ensures data is synced regularly even during low activity
SELECT
  cron.schedule (
    'process_libsql_replication',
    '*/5 * * * *',
    'SELECT process_libsql_replication_batch();'
  );
