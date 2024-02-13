select vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
select vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
select vault.create_secret('http://localhost:8881/.netlify/functions/', 'external_function_url', 'external function url'); -- Netlify backend for long runny functions
select vault.create_secret('testsecret', 'apikey', 'admin user id');
select vault.create_secret('http://host.docker.internal:6655', 'd1_http_url', 'd1 replication HTTP url');
select vault.create_secret('***', 'd1_cf_apikey', 'D1 cloudflare API key');

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

CREATE TRIGGER on_devices_override_update 
AFTER INSERT or UPDATE or DELETE ON public.devices_override 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');

CREATE TRIGGER on_channel_devices_update 
AFTER INSERT or UPDATE or DELETE ON public.channel_devices 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');

-- Create cron jobs
-- Set old versions to deleted after retention passed 
SELECT cron.schedule('Delete old app version', '40 0 * * *', $$CALL update_app_versions_retention()$$);
-- update channel for progressive deploy if too many fail
SELECT cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);
SELECT cron.schedule('Update web stats', '22 1 * * *', $$SELECT http_post_to_function('web_stats-background', 'external', '{}'::jsonb)$$);
SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_to_function('cron_good_plan-background', 'external', '{}'::jsonb)$$);
SELECT cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT http_post_to_function('cron_email-background', 'external', '{}'::jsonb)$$);

SELECT reset_and_seed_data();
