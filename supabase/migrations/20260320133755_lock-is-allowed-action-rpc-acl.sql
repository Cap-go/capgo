-- ============================================================================
-- Lock down is_allowed_action RPC permissions to service_role only
-- ============================================================================
REVOKE ALL ON FUNCTION public.is_allowed_action(
    apikey text,
    appid text
) FROM anon;

REVOKE ALL ON FUNCTION public.is_allowed_action(
    apikey text,
    appid text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.is_allowed_action(
    apikey text,
    appid text
) FROM public;

GRANT EXECUTE ON FUNCTION public.is_allowed_action(
    apikey text,
    appid text
) TO service_role;

ALTER FUNCTION public.is_allowed_action(
    apikey text,
    appid text
) OWNER TO postgres;
