ALTER FUNCTION "public"."cleanup_frequent_job_details"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details"() TO "service_role";

ALTER FUNCTION "public"."remove_old_jobs"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_old_jobs"() TO "service_role";

-- Add index to notifications table reporter by supabase 
CREATE INDEX ON public.notifications USING btree (uniq_id);
CREATE INDEX ON public.channel_devices USING btree (device_id);

-- Add consumer functions for each queue
CREATE OR REPLACE FUNCTION "public"."decrement_read_ct"(queue_name text, msg_id bigint)
RETURNS void
LANGUAGE "plpgsql"
AS $$
BEGIN
    EXECUTE 'UPDATE pgmq.q_' || quote_ident(queue_name) || ' SET read_ct = GREATEST(read_ct - 1, 0) WHERE msg_id = $1'
    USING msg_id;
END;
$$;

ALTER FUNCTION "public"."decrement_read_ct"(queue_name text, msg_id bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."decrement_read_ct"(queue_name text, msg_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrement_read_ct"(queue_name text, msg_id bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."edit_request_id"(queue_name text, msg_id bigint, new_request_id bigint)
RETURNS void
LANGUAGE "plpgsql"
AS $$
BEGIN
    EXECUTE 'UPDATE pgmq.q_' || quote_ident(queue_name) || ' SET message = jsonb_set(message, ''{request_id}'', to_jsonb($1)) WHERE msg_id = $2'
    USING new_request_id, msg_id;
END;
$$;

ALTER FUNCTION "public"."edit_request_id"(queue_name text, msg_id bigint, new_request_id bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."edit_request_id"(queue_name text, msg_id bigint, new_request_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_request_id"(queue_name text, msg_id bigint, new_request_id bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."delete_http_response"(request_id bigint)
RETURNS void
LANGUAGE "plpgsql"
AS $$
BEGIN
    DELETE FROM net._http_response 
    WHERE id = request_id;
END;
$$;

ALTER FUNCTION "public"."delete_http_response"(request_id bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."delete_http_response"(request_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_http_response"(request_id bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."process_function_queue"(queue_name text)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
AS $$
DECLARE
    msg record;
    payload jsonb;
    request_id bigint;
    response record;
BEGIN
    -- Read messages
    FOR msg IN SELECT * FROM pgmq.read(queue_name, 60, 2000)
    LOOP
        BEGIN
            -- Parse message as JSONB
            payload := msg.message::jsonb;
            SELECT * INTO response 
            FROM net._http_response 
            WHERE id = (payload->>'request_id')::bigint;
            
            IF (payload->>'request_id') IS NOT NULL AND FOUND AND response.status_code IS NULL AND response.error_msg IS NULL THEN
              -- We decremented the read_ct to not count this message as a retry
              PERFORM decrement_read_ct(queue_name, msg.msg_id);
              -- Query exist but response is not ready, skip
            ELSIF (payload->>'request_id') IS NOT NULL AND FOUND AND response.error_msg IS NULL AND response.status_code >= 200 AND response.status_code < 300 THEN
              -- Query exist and response is Success, delete message
              PERFORM pgmq.delete(queue_name, msg.msg_id);
              -- Delete the request_id from the _http_response table
              PERFORM delete_http_response((payload->>'request_id')::bigint);
            ELSIF (payload->>'request_id') IS NOT NULL AND FOUND AND msg.read_ct >= 5 THEN
              -- Query exist and max retries reached, archive message
              PERFORM pgmq.archive(queue_name, msg.msg_id);
            ELSIF (payload->>'request_id') IS NOT NULL AND FOUND AND response.error_msg IS NOT NULL THEN
              -- Delete the request_id from the payload to make it retry while keeping the request response
              PERFORM edit_request_id(queue_name, msg.msg_id, null);
              -- Query exist and response is Error, retry after 30 seconds
              PERFORM decrement_read_ct(queue_name, msg.msg_id);
              -- Set a delay before retrying
              PERFORM pgmq.set_vt(queue_name, msg.msg_id, 30);
            ELSE
              -- Query does not exist or failed, send new request
              SELECT http_post_helper(
                  payload->>'function_name',
                  payload->>'function_type',
                  payload->'payload'
              ) INTO request_id;
              -- Update message with request_id
              PERFORM edit_request_id(queue_name, msg.msg_id, request_id);
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- On error, if max retries reached archive, otherwise retry
            IF msg.read_ct >= 5 THEN
                PERFORM pgmq.archive(queue_name, msg.msg_id);
            ELSE
                PERFORM pgmq.set_vt(queue_name, msg.msg_id, 30);
            END IF;
        END;
    END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_function_queue"(queue_name text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."process_function_queue"(queue_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_function_queue"(queue_name text) TO "service_role";
