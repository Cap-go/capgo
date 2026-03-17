-- Harden the get_identity_apikey_only RPC so that only service_role (and postgres)
-- can invoke it directly while providing a helper that lets RLS/other policies reuse
-- the same logic without exposing the RPC to anon/authenticated callers.

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only" (
    "keymode" "public"."key_mode" []
) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
    api_key_text text;
    api_key record;
BEGIN
  IF COALESCE(current_setting('capgo.allow_get_identity_apikey_only', true), 'false') <> 'true'
    AND current_setting('role') NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'permission denied for get_identity_apikey_only';
  END IF;

  SELECT "public"."get_apikey_header"() INTO api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  IF api_key.id IS NOT NULL AND api_key.mode = ANY(get_identity_apikey_only.keymode) THEN
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RETURN NULL;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_apikey_only" (
    "keymode" "public"."key_mode" []
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only_rls" (
    "keymode" "public"."key_mode" []
) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  PERFORM set_config('capgo.allow_get_identity_apikey_only', 'true', true);
  RETURN public.get_identity_apikey_only(get_identity_apikey_only_rls.keymode);
END;
$$;

ALTER FUNCTION "public"."get_identity_apikey_only_rls" (
    "keymode" "public"."key_mode" []
) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only_rls" (
    "keymode" "public"."key_mode" []
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only_rls" (
    "keymode" "public"."key_mode" []
) TO "authenticated";
