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
