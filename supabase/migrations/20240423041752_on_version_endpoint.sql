-- DROP TRIGGER on_version_create ON "public"."app_versions";
CREATE TRIGGER on_version_create 
AFTER INSERT ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_create', 'cloudflare');

-- DROP TRIGGER on_version_update ON "public"."app_versions";
CREATE TRIGGER on_version_update 
AFTER UPDATE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_update', 'cloudflare');
