-- Revoke public/unauthenticated exposure of API key identity helper RPC.
-- Keeping SERVICE_ROLE access is required for internal backend paths that still
-- rely on this helper for authorization checks.

REVOKE ALL ON FUNCTION public.get_identity_apikey_only(
    keymode public.key_mode []
) FROM public;

REVOKE ALL ON FUNCTION public.get_identity_apikey_only(
    keymode public.key_mode []
) FROM anon;

REVOKE ALL ON FUNCTION public.get_identity_apikey_only(
    keymode public.key_mode []
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_identity_apikey_only(
    keymode public.key_mode []
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_identity_apikey_only(
    keymode public.key_mode []
) TO postgres;
