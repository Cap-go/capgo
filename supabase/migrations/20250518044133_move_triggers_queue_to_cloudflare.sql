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
BEGIN
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apisecret', get_apikey()
  );
  url := get_db_url() || '/functions/v1/queue_consumer/sync';

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := url,
    headers := headers,
    body := jsonb_build_object('queue_name', queue_name),
    timeout_milliseconds := 15000
  );
  RETURN request_id;
END;
$$;

-- -- Make the function private to service_role
ALTER FUNCTION public.process_function_queue(queue_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_function_queue(queue_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_function_queue(queue_name text) TO service_role;

-- Reschedule each queue to run every 10 seconds using process_function_queue
SELECT cron.schedule('process_cron_email_queue', '10 seconds', $$SELECT public.process_function_queue('cron_email_queue')$$);
SELECT cron.schedule('process_cron_stats_queue', '10 seconds', $$SELECT public.process_function_queue('cron_stats_queue')$$);
SELECT cron.schedule('process_cron_plan_queue', '10 seconds', $$SELECT public.process_function_queue('cron_plan_queue')$$);
SELECT cron.schedule('process_cron_clear_versions_queue', '10 seconds', $$SELECT public.process_function_queue('cron_clear_versions_queue')$$);
SELECT cron.schedule('process_app_events_queue', '10 seconds', $$SELECT public.process_function_queue('app_events_queue')$$);
SELECT cron.schedule('process_channel_update_queue', '10 seconds', $$SELECT public.process_function_queue('channel_update_queue')$$);
SELECT cron.schedule('process_organization_create_queue', '10 seconds', $$SELECT public.process_function_queue('organization_create_queue')$$);
SELECT cron.schedule('process_organization_delete_queue', '10 seconds', $$SELECT public.process_function_queue('organization_delete_queue')$$);
SELECT cron.schedule('process_user_create_queue', '10 seconds', $$SELECT public.process_function_queue('user_create_queue')$$);
SELECT cron.schedule('process_user_update_queue', '10 seconds', $$SELECT public.process_function_queue('user_update_queue')$$);
SELECT cron.schedule('process_version_create_queue', '10 seconds', $$SELECT public.process_function_queue('version_create_queue')$$);
SELECT cron.schedule('process_version_delete_queue', '10 seconds', $$SELECT public.process_function_queue('version_delete_queue')$$);
SELECT cron.schedule('process_version_update_queue', '10 seconds', $$SELECT public.process_function_queue('version_update_queue')$$);
SELECT cron.schedule('process_app_delete_queue', '10 seconds', $$SELECT public.process_function_queue('app_delete_queue')$$);
