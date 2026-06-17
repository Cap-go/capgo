CREATE OR REPLACE FUNCTION "public"."get_user_identity_for_apikey"("apikey" "text")
RETURNS TABLE("correlation_id" "text")
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
  SELECT concat('capgo-cli-user:', md5(api_key.user_id::text));
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
IS 'Returns only an opaque stable correlation id for a valid, non-expired API key owner. It intentionally does not expose user ids or emails through the public RPC surface.';
