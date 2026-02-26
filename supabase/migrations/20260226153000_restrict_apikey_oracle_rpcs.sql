-- ============================================================================
-- Revoke anonymous access to API-key introspection RPCs
-- ============================================================================
REVOKE EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM "anon";
