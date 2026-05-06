-- Make apikeys.mode nullable for RBAC v2 API keys that use role_bindings
-- instead of the legacy mode-based permission system.
-- When mode IS NULL, the key's permissions are determined solely by its role_bindings.

ALTER TABLE "public"."apikeys"
  ALTER COLUMN "mode" DROP NOT NULL;

COMMENT ON COLUMN "public"."apikeys"."mode" IS
  'Legacy permission mode. NULL means permissions are managed via RBAC role_bindings.';

CREATE OR REPLACE FUNCTION "public"."get_identity_for_apikey_creation"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  auth_uid uuid;
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT auth.uid() INTO auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO api_key
  FROM public.find_apikey_by_value(api_key_text)
  LIMIT 1;

  IF api_key.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.is_apikey_expired(api_key.expires_at) THEN
    PERFORM public.pg_log('deny: APIKEY_CREATE_API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
    RETURN NULL;
  END IF;

  IF api_key.mode IS DISTINCT FROM 'all'::public.key_mode THEN
    PERFORM public.pg_log('deny: APIKEY_CREATE_API_KEY_MODE', jsonb_build_object('key_id', api_key.id, 'mode', api_key.mode));
    RETURN NULL;
  END IF;

  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0
    OR COALESCE(array_length(api_key.limited_to_apps, 1), 0) > 0
  THEN
    PERFORM public.pg_log('deny: APIKEY_CREATE_LIMITED_API_KEY', jsonb_build_object('key_id', api_key.id));
    RETURN NULL;
  END IF;

  RETURN api_key.user_id;
END;
$$;

ALTER FUNCTION "public"."get_identity_for_apikey_creation"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_identity_for_apikey_creation"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_identity_for_apikey_creation"() TO "service_role";

DROP POLICY IF EXISTS "Allow owner to insert own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to insert own apikeys" ON "public"."apikeys"
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (
  "mode" IS NOT NULL
  AND "user_id" = (SELECT public.get_identity_for_apikey_creation())
);

DROP POLICY IF EXISTS "Allow owner to update own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to update own apikeys" ON "public"."apikeys"
FOR UPDATE
TO "anon", "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
)
WITH CHECK (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);

-- Public RPC for legacy mode-based keys. RBAC-managed keys (mode IS NULL)
-- must be created by the Edge endpoint so the key and role_bindings are created
-- together in one transaction and cannot be bypassed through direct PostgREST.
CREATE OR REPLACE FUNCTION "public"."create_hashed_apikey"(
  "p_mode" "public"."key_mode" DEFAULT NULL,
  "p_name" "text" DEFAULT '',
  "p_limited_to_orgs" "uuid"[] DEFAULT '{}'::uuid[],
  "p_limited_to_apps" "text"[] DEFAULT '{}'::text[],
  "p_expires_at" timestamp with time zone DEFAULT NULL
) RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_plain_key text;
  v_apikey public.apikeys;
BEGIN
  IF p_mode IS NULL THEN
    RAISE EXCEPTION 'RBAC_MANAGED_APIKEY_REQUIRES_BINDINGS';
  END IF;

  SELECT public.get_identity_for_apikey_creation() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided';
  END IF;

  v_plain_key := gen_random_uuid()::text;

  PERFORM set_config('capgo.skip_apikey_trigger', 'true', true);

  INSERT INTO public.apikeys (
    user_id,
    key,
    key_hash,
    mode,
    name,
    limited_to_orgs,
    limited_to_apps,
    expires_at
  )
  VALUES (
    v_user_id,
    NULL,
    encode(extensions.digest(v_plain_key, 'sha256'), 'hex'),
    p_mode,
    p_name,
    COALESCE(p_limited_to_orgs, '{}'::uuid[]),
    COALESCE(p_limited_to_apps, '{}'::text[]),
    p_expires_at
  )
  RETURNING * INTO v_apikey;

  v_apikey.key := v_plain_key;

  RETURN v_apikey;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_hashed_apikey_for_user"(
  "p_user_id" "uuid",
  "p_mode" "public"."key_mode" DEFAULT NULL,
  "p_name" "text" DEFAULT '',
  "p_limited_to_orgs" "uuid"[] DEFAULT '{}'::uuid[],
  "p_limited_to_apps" "text"[] DEFAULT '{}'::text[],
  "p_expires_at" timestamp with time zone DEFAULT NULL
) RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_plain_key text;
  v_apikey public.apikeys;
BEGIN
  v_plain_key := gen_random_uuid()::text;

  PERFORM set_config('capgo.skip_apikey_trigger', 'true', true);

  INSERT INTO public.apikeys (
    user_id,
    key,
    key_hash,
    mode,
    name,
    limited_to_orgs,
    limited_to_apps,
    expires_at
  )
  VALUES (
    p_user_id,
    NULL,
    encode(extensions.digest(v_plain_key, 'sha256'), 'hex'),
    p_mode,
    p_name,
    COALESCE(p_limited_to_orgs, '{}'::uuid[]),
    COALESCE(p_limited_to_apps, '{}'::text[]),
    p_expires_at
  )
  RETURNING * INTO v_apikey;

  v_apikey.key := v_plain_key;

  RETURN v_apikey;
END;
$$;

ALTER FUNCTION "public"."create_hashed_apikey"(
  "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) OWNER TO "postgres";
ALTER FUNCTION "public"."create_hashed_apikey_for_user"(
  "uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_hashed_apikey_for_user"(
  "uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."create_hashed_apikey_for_user"(
  "uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) FROM "anon";
REVOKE ALL ON FUNCTION "public"."create_hashed_apikey_for_user"(
  "uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_hashed_apikey_for_user"(
  "uuid", "public"."key_mode", "text", "uuid"[], "text"[], timestamp with time zone
) TO "service_role";
