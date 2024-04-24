CREATE TRIGGER on_channel_create 
AFTER INSERT ON public.channels 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_create');

CREATE TRIGGER on_channel_update 
AFTER UPDATE ON public.channels 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_update');

CREATE TRIGGER on_user_create 
AFTER INSERT ON public.users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_create');

CREATE TRIGGER on_user_update 
AFTER UPDATE ON public.users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_update');

CREATE TRIGGER on_version_create 
AFTER INSERT ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_create');

CREATE TRIGGER on_version_delete
AFTER DELETE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_delete');

CREATE TRIGGER on_version_update 
AFTER UPDATE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_update');

-- Create cron jobs
-- Set old versions to deleted after retention passed 
SELECT cron.schedule('Delete old app version', '40 0 * * *', $$CALL update_app_versions_retention()$$);
-- update channel for progressive deploy if too many fail
SELECT cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);
SELECT cron.schedule('Update insights', '22 1 * * *', $$SELECT http_post_helper('logsnag_insights', '', '{}'::jsonb)$$);
SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_helper('cron_good_plan', '', '{}'::jsonb)$$);
SELECT cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT http_post_helper('cron_email', '', '{}'::jsonb)$$);
