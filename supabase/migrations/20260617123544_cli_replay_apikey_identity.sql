CREATE OR REPLACE FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text")
RETURNS TABLE("user_id" "uuid", "email" "text")
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  IF api_key.id IS NULL OR public.is_apikey_expired(api_key.expires_at) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT users.id, users.email::text
  FROM public.users
  WHERE users.id = api_key.user_id
  LIMIT 1;
END;
$$;

ALTER FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") FROM "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text") TO "service_role";

COMMENT ON FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text")
IS 'Returns the owner user id and email only when the caller already has a valid, non-expired API key. This limited exposure is intentional so CLI onboarding replay can attach to the same PostHog person as product analytics instead of creating anonymous replay-only users.';
