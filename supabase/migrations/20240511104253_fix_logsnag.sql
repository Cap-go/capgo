CREATE TRIGGER on_app_create 
AFTER INSERT ON public.apps 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_app_create');