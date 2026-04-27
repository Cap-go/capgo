-- Fix GHSA-7r6g-whg3-5mm4 by revoking helper RPC execution from PUBLIC.
--
-- Previous migrations only revoked these SECURITY DEFINER functions from the
-- anon role directly. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, and anon/authenticated both inherit PUBLIC, so the direct anon
-- revokes did not actually remove access.

REVOKE ALL ON FUNCTION public.get_user_id("apikey" text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id("apikey" text) FROM ANON;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text
) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM ANON;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_user_id(
    "apikey" text, "app_id" text
) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM ANON;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM AUTHENTICATED;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) FROM SERVICE_ROLE;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey(
    "apikey" text, "app_id" text
) TO SERVICE_ROLE;
