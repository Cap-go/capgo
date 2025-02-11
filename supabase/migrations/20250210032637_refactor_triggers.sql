
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
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Trigger for devices_override table
CREATE TRIGGER replicate_devices_override
    AFTER INSERT OR UPDATE OR DELETE ON public.devices_override
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Trigger for channels table
CREATE TRIGGER replicate_channels
    AFTER INSERT OR UPDATE OR DELETE ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Trigger for channel_devices table
CREATE TRIGGER replicate_channel_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.channel_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Trigger for apps table
CREATE TRIGGER replicate_apps
    AFTER INSERT OR UPDATE OR DELETE ON public.apps
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

-- Trigger for orgs table
CREATE TRIGGER replicate_orgs
    AFTER INSERT OR UPDATE OR DELETE ON public.orgs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

CREATE TRIGGER replicate_stripe_info
    AFTER INSERT OR UPDATE OR DELETE ON public.stripe_info
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1();

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
            'cloudflare',
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

CREATE TRIGGER replicate_apps
    AFTER INSERT OR UPDATE OR DELETE ON public.apps
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function_d1('replicate_data', 'cloudflare_pp');

-- add id in stripe_info not primary key
ALTER TABLE stripe_info ADD COLUMN id SERIAL;
