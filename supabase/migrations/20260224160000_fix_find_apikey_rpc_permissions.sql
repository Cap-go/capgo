-- ============================================================================
-- Restrict find_apikey_by_value RPC access to service-role callers only
-- ============================================================================
-- Even after the previous security hardening migration, `find_apikey_by_value`
-- was still exposed via PUBLIC execute privilege.
-- This removes any remaining broad execute permissions and keeps service-role
-- access only so the function cannot be called through unauthenticated RPC.

REVOKE ALL ON FUNCTION "public"."find_apikey_by_value"(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "service_role";
