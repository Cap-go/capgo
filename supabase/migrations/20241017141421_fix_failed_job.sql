-- Create retry_failed_jobs function
CREATE OR REPLACE FUNCTION "public"."retry_failed_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    discord_webhook_url TEXT;
    failed_job RECORD;
BEGIN
    SELECT decrypted_secret INTO discord_webhook_url
    FROM vault.decrypted_secrets
    WHERE name = 'DISCORD_WEBHOOK_URL';

    FOR failed_job IN 
        SELECT * FROM job_queue
        WHERE status = 'failed'::"public"."queue_job_status" AND retry_count <= retry_limit
        FOR UPDATE
    LOOP
        IF failed_job.retry_count = failed_job.retry_limit THEN
            -- Send Discord notification
            IF discord_webhook_url IS NOT NULL THEN
                PERFORM net.http_post(
                    url := discord_webhook_url,
                    headers := '{"Content-Type": "application/json"}'::jsonb,
                    body := format('{"content": "Job for org %s has failed %s times and reached the retry limit. Details: %s"}', 
                                   failed_job.org_id, failed_job.retry_count, 
                                   failed_job.extra_info)::jsonb
                );
            END IF;
            
            -- Mark as exceeding retry limit
            UPDATE job_queue
            SET retry_count = retry_limit + 1
            WHERE job_id = failed_job.job_id;
        ELSE
            -- Retry the job
            UPDATE job_queue
            SET status = 'inserted'::"public"."queue_job_status"
            WHERE job_id = failed_job.job_id;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_d1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the payload
  payload := jsonb_build_object(
    'old_record', OLD, 
    'record', NEW, 
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'retry_count', 0
  );

  -- Insert into job_queue
  INSERT INTO job_queue (job_type, payload, function_name, function_type) VALUES ('TRIGGER', payload::text, TG_ARGV[0], TG_ARGV[1]);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_http_queue_post_to_function_d1"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS replicate_app_versions ON public.app_versions;

DROP TRIGGER IF EXISTS replicate_devices_override ON public.devices_override;

DROP TRIGGER IF EXISTS replicate_channels ON public.channels;

DROP TRIGGER IF EXISTS replicate_channel_devices ON public.channel_devices;

DROP TRIGGER IF EXISTS replicate_apps ON public.apps;

DROP TRIGGER IF EXISTS replicate_orgs ON public.orgs;

-- Trigger for app_versions table
CREATE TRIGGER replicate_app_versions
    AFTER INSERT OR UPDATE OR DELETE ON public.app_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');

-- Trigger for devices_override table
CREATE TRIGGER replicate_devices_override
    AFTER INSERT OR UPDATE OR DELETE ON public.devices_override
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');

-- Trigger for channels table
CREATE TRIGGER replicate_channels
    AFTER INSERT OR UPDATE OR DELETE ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');

-- Trigger for channel_devices table
CREATE TRIGGER replicate_channel_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.channel_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');

-- Trigger for apps table
CREATE TRIGGER replicate_apps
    AFTER INSERT OR UPDATE OR DELETE ON public.apps
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');

-- Trigger for orgs table
CREATE TRIGGER replicate_orgs
    AFTER INSERT OR UPDATE OR DELETE ON public.orgs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare');
