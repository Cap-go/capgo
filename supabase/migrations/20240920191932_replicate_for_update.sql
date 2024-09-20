-- Trigger for app_versions table
CREATE TRIGGER replicate_app_versions
    AFTER INSERT OR UPDATE OR DELETE ON public.app_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for devices_override table
CREATE TRIGGER replicate_devices_override
    AFTER INSERT OR UPDATE OR DELETE ON public.devices_override
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for channels table
CREATE TRIGGER replicate_channels
    AFTER INSERT OR UPDATE OR DELETE ON public.channels
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for channel_devices table
CREATE TRIGGER replicate_channel_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.channel_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for apps table
CREATE TRIGGER replicate_apps
    AFTER INSERT OR UPDATE OR DELETE ON public.apps
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for orgs table
CREATE TRIGGER replicate_orgs
    AFTER INSERT OR UPDATE OR DELETE ON public.orgs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

-- Trigger for devices table
CREATE TRIGGER replicate_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.devices
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_http_queue_post_to_function('replicate_data', 'cloudflare');

