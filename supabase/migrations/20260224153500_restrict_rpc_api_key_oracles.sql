-- Revoke anonymous execution of key-validation RPCs to prevent unauthenticated oracles
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") FROM "anon";
