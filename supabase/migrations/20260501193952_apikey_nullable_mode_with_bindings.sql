-- Make apikeys.mode nullable for RBAC v2 API keys that use role_bindings
-- instead of the legacy mode-based permission system.
-- When mode IS NULL, the key's permissions are determined solely by its role_bindings.

ALTER TABLE "public"."apikeys"
  ALTER COLUMN "mode" DROP NOT NULL;

COMMENT ON COLUMN "public"."apikeys"."mode" IS
  'Legacy permission mode. NULL means permissions are managed via RBAC role_bindings.';

-- Drop and recreate create_hashed_apikey to accept nullable mode
DROP FUNCTION IF EXISTS "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone);

CREATE OR REPLACE FUNCTION "public"."create_hashed_apikey"(
  "p_mode" "public"."key_mode" DEFAULT NULL,
  "p_name" "text" DEFAULT '',
  "p_limited_to_orgs" "uuid"[] DEFAULT '{}'::uuid[],
  "p_limited_to_apps" "text"[] DEFAULT '{}'::text[],
  "p_expires_at" timestamp with time zone DEFAULT NULL
) RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT public.get_identity('{write,all}'::public.key_mode[]) INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided';
  END IF;

  RETURN public.create_hashed_apikey_for_user(
    v_user_id,
    p_mode,
    p_name,
    COALESCE(p_limited_to_orgs, '{}'::uuid[]),
    COALESCE(p_limited_to_apps, '{}'::text[]),
    p_expires_at
  );
END;
$$;

ALTER FUNCTION "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_hashed_apikey"("p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) TO "authenticated";

-- Drop and recreate create_hashed_apikey_for_user to accept nullable mode
DROP FUNCTION IF EXISTS "public"."create_hashed_apikey_for_user"("p_user_id" "uuid", "p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone);

CREATE OR REPLACE FUNCTION "public"."create_hashed_apikey_for_user"(
  "p_user_id" "uuid",
  "p_mode" "public"."key_mode" DEFAULT NULL,
  "p_name" "text" DEFAULT '',
  "p_limited_to_orgs" "uuid"[] DEFAULT '{}'::uuid[],
  "p_limited_to_apps" "text"[] DEFAULT '{}'::text[],
  "p_expires_at" timestamp with time zone DEFAULT NULL
) RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
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

ALTER FUNCTION "public"."create_hashed_apikey_for_user"("p_user_id" "uuid", "p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_hashed_apikey_for_user"("p_user_id" "uuid", "p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_hashed_apikey_for_user"("p_user_id" "uuid", "p_mode" "public"."key_mode", "p_name" "text", "p_limited_to_orgs" "uuid"[], "p_limited_to_apps" "text"[], "p_expires_at" timestamp with time zone) TO "service_role";
