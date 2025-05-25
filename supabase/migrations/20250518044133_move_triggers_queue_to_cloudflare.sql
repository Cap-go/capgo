SELECT cron.unschedule('process_cron_email_queue');
SELECT cron.unschedule('process_cron_stats_queue');
SELECT cron.unschedule('process_cron_plan_queue');
SELECT cron.unschedule('process_cron_clear_versions_queue');
SELECT cron.unschedule('process_app_events_queue');
SELECT cron.unschedule('process_channel_update_queue');
SELECT cron.unschedule('process_organization_create_queue');
SELECT cron.unschedule('process_organization_delete_queue');
SELECT cron.unschedule('process_user_create_queue');
SELECT cron.unschedule('process_user_update_queue');
SELECT cron.unschedule('process_version_create_queue');
SELECT cron.unschedule('process_version_delete_queue');
SELECT cron.unschedule('process_version_update_queue');
SELECT cron.unschedule('process_app_delete_queue');
SELECT cron.unschedule('Update insights');
SELECT cron.unschedule('Update plan');

DROP FUNCTION public.process_function_queue(queue_name text);
DROP FUNCTION "public"."edit_request_id"(queue_name text, msg_id bigint, new_request_id bigint);
DROP FUNCTION "public"."decrement_read_ct"(queue_name text, msg_id bigint);

-- Create or replace the process_function_queue function
CREATE OR REPLACE FUNCTION public.process_function_queue(queue_name text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  request_id text;
  headers jsonb;
  url text;
  queue_size bigint;
  queue_table_name text;
  calls_needed int;
  i int;
BEGIN
  -- Construct the queue table name
  queue_table_name := 'pgmq.q_' || queue_name;
  
  -- Check if the queue has elements
  EXECUTE format('SELECT count(*) FROM %I', queue_table_name) INTO queue_size;
  
  -- Only make the HTTP request if the queue is not empty
  IF queue_size > 0 THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', get_apikey()
    );
    url := get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    -- Calculate how many times to call the sync endpoint (1 call per 1000 items, max 10 calls)
    calls_needed := least(ceil(queue_size / 1000.0)::int, 10);

    -- Call the endpoint multiple times if needed
    FOR i IN 1..calls_needed LOOP
      SELECT INTO request_id net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name),
        timeout_milliseconds := 15000
      );
    END LOOP;
    
    RETURN request_id;
  END IF;
  
  RETURN NULL;
END;
$$;

DROP FUNCTION "public"."http_post_helper"(function_name text, function_type text, body jsonb);
DROP FUNCTION "public"."get_netlify_function_url"();
DROP FUNCTION "public"."get_cloudflare_function_url"();
DROP FUNCTION "public"."get_cloudflare_pp_function_url"();

-- -- Make the function private to service_role
ALTER FUNCTION public.process_function_queue(queue_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_function_queue(queue_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_function_queue(queue_name text) TO service_role;

CREATE OR REPLACE FUNCTION "public"."process_admin_stats"()
RETURNS "void"
LANGUAGE "plpgsql"
AS $$
DECLARE
  org_record RECORD;
BEGIN
    PERFORM pgmq.send('admin_stats',
      jsonb_build_object(
        'function_name', 'logsnag_insights',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object()
      )
    );
END;
$$;

ALTER FUNCTION public.process_admin_stats() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_admin_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_admin_stats() TO service_role;

SELECT cron.schedule(
    'process_admin_stats',
    '22 1 * * *',
    $$SELECT process_admin_stats();$$
);

-- Reschedule each queue to run every 10 seconds using process_function_queue
SELECT cron.schedule('process_cron_stats_queue', '10 seconds', $$SELECT public.process_function_queue('cron_stats')$$);
SELECT cron.schedule('process_channel_update_queue', '10 seconds', $$SELECT public.process_function_queue('on_channel_update')$$);
SELECT cron.schedule('process_user_create_queue', '10 seconds', $$SELECT public.process_function_queue('on_user_create')$$);
SELECT cron.schedule('process_user_update_queue', '10 seconds', $$SELECT public.process_function_queue('on_user_update')$$);
SELECT cron.schedule('process_version_delete_queue', '10 seconds', $$SELECT public.process_function_queue('on_version_delete')$$);
SELECT cron.schedule('process_version_update_queue', '10 seconds', $$SELECT public.process_function_queue('on_version_update')$$);
SELECT cron.schedule('process_app_delete_queue', '10 seconds', $$SELECT public.process_function_queue('on_app_delete')$$);


SELECT cron.schedule('process_cron_plan_queue', '0 */2 * * *', $$SELECT public.process_function_queue('cron_plan_queue')$$);
SELECT cron.schedule('process_admin_stats', '0 */2 * * *', $$SELECT public.process_function_queue('admin_stats')$$);
SELECT cron.schedule('process_cron_clear_versions_queue', '0 */2 * * *', $$SELECT public.process_function_queue('cron_clear_versions_queue')$$);
SELECT cron.schedule('process_cron_email_queue', '0 */2 * * *', $$SELECT public.process_function_queue('cron_email_queue')$$);
SELECT cron.schedule('process_app_create_queue', '0 */2 * * *', $$SELECT public.process_function_queue('on_app_create')$$);
SELECT cron.schedule('process_version_create_queue', '0 */2 * * *', $$SELECT public.process_function_queue('on_version_create')$$);
SELECT cron.schedule('process_organization_create_queue', '0 */2 * * *', $$SELECT public.process_function_queue('on_organization_create')$$);
SELECT cron.schedule('process_organization_delete_queue', '0 */2 * * *', $$SELECT public.process_function_queue('on_organization_delete')$$);

-- new queue for deploy history create
SELECT pgmq.create('on_deploy_history_create');
SELECT cron.schedule('process_deploy_history_create_queue', '0 */2 * * *', $$SELECT public.process_function_queue('on_deploy_history_create')$$);



