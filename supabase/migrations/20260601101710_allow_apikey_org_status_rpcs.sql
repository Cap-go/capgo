-- The CLI uses the Supabase anon key and authenticates Capgo access with the
-- capgkey request header. These status RPCs already perform org-scoped read
-- checks via request_has_org_read_access(), so anon needs EXECUTE permission for
-- valid API-key callers to receive trial warning context.
REVOKE ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "service_role";
