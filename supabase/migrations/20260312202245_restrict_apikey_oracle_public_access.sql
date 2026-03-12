-- ============================================================================
-- Remove public execute rights from API key oracle RPCs
-- ============================================================================
REVOKE EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM PUBLIC;

-- Preserve internal access via service role only
-- Keep parameterized API key helpers private to avoid key-oracle exposure

GRANT EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") TO "service_role";
