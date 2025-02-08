CREATE OR REPLACE FUNCTION "public"."get_cloudflare_pp_function_url"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cloudflare_pp_function_url';
$$;

ALTER FUNCTION "public"."get_cloudflare_pp_function_url"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."get_cloudflare_pp_function_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_cloudflare_pp_function_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cloudflare_pp_function_url"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
<<declared>>
DECLARE 
  request_id text;
  headers jsonb;
  url text;
BEGIN 
  headers := jsonb_build_object(
    'Content-Type',
    'application/json',
    'apisecret',
    get_apikey()
  );
  -- Determine the URL based on the function_type
  CASE function_type
  WHEN 'netlify' THEN
    url := get_netlify_function_url() || '/triggers/' || function_name;
  WHEN 'cloudflare' THEN
    url := get_cloudflare_function_url() || '/triggers/' || function_name;
  WHEN 'cloudflare_pp' THEN
    url := get_cloudflare_pp_function_url() || '/triggers/' || function_name;
  ELSE
    url := get_db_url() || '/functions/v1/triggers/' || function_name;
  END CASE;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := declared.url,
    headers := declared.headers,
    body := body,
    timeout_milliseconds := 15000
  );
  return request_id;
END;
$$;

REVOKE ALL ON FUNCTION "public"."http_post_helper"(
    "function_name" "text", "function_type" "text", "body" "jsonb"
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."http_post_helper"(
    "function_name" "text", "function_type" "text", "body" "jsonb"
) FROM "anon";
REVOKE ALL ON FUNCTION "public"."http_post_helper"(
    "function_name" "text", "function_type" "text", "body" "jsonb"
) FROM "authenticated";
GRANT ALL ON FUNCTION "public"."http_post_helper"(
    "function_name" "text", "function_type" "text", "body" "jsonb"
) TO "service_role";

DROP TRIGGER IF EXISTS replicate_apps ON public.apps;

CREATE TRIGGER replicate_apps
    AFTER INSERT OR UPDATE OR DELETE ON public.apps
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare_pp');

CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    queue_name text;
BEGIN
    -- Clean up messages older than 7 days from all queues
    FOR queue_name IN (
        SELECT name FROM pgmq.list_queues()
    ) LOOP
        -- Delete archived messages older than 7 days
        EXECUTE format('DELETE FROM pgmq.a_%I WHERE archived_at < $1', queue_name)
        USING (NOW() - INTERVAL '7 days')::timestamptz;
        
        -- Delete failed messages that have been retried more than 5 times
        EXECUTE format('DELETE FROM pgmq.q_%I WHERE read_ct > 5', queue_name);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."process_d1_replication_batch"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg record;
    batch_operations jsonb[];
    messages_to_delete bigint[];
    batch_size int := 999;  -- D1 limit is 1000
BEGIN
    batch_operations := array[]::jsonb[];
    messages_to_delete := array[]::bigint[];
    
    -- Read messages in batch
    FOR msg IN 
        SELECT * FROM pgmq.read('replicate_data', 60, batch_size)
    LOOP
        -- Add operation to batch
        batch_operations := array_append(batch_operations, msg.message::jsonb);
        messages_to_delete := array_append(messages_to_delete, msg.msg_id);
    END LOOP;
    
    -- Process batch if we have any operations
    IF array_length(batch_operations, 1) > 0 THEN
        -- Send request using http_post_helper
        PERFORM http_post_helper(
            'replicate_data',
            'cloudflare_pp',
            jsonb_build_object('operations', batch_operations)
        );
        
        -- Delete processed messages
        FOREACH msg.msg_id IN ARRAY messages_to_delete
        LOOP
            PERFORM pgmq.delete('replicate_data', msg.msg_id);
        END LOOP;
    END IF;
END;
$$;

-- Set permissions
REVOKE ALL ON FUNCTION "public"."process_d1_replication_batch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_d1_replication_batch"() TO "postgres";
