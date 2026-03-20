REVOKE ALL ON FUNCTION public.cleanup_expired_demo_apps() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.cleanup_expired_demo_apps() FROM ANON;

REVOKE ALL ON FUNCTION public.cleanup_expired_demo_apps()
FROM AUTHENTICATED;
