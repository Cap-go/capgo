-- Make apikeys.mode nullable for RBAC v2 API keys that use role_bindings
-- instead of the legacy mode-based permission system.
-- When mode IS NULL, the key's permissions are determined solely by its role_bindings.

ALTER TABLE "public"."apikeys"
  ALTER COLUMN "mode" DROP NOT NULL;

COMMENT ON COLUMN "public"."apikeys"."mode" IS
  'Legacy permission mode. NULL means permissions are managed via RBAC role_bindings.';

-- Use CREATE OR REPLACE (not DROP + CREATE) to preserve existing grants.
-- The original migration (20260206120000) set SECURITY INVOKER and relied on the
-- default PUBLIC execute grant for create_hashed_apikey_for_user. Dropping and
-- recreating would reset that grant and break the call chain from
-- create_hashed_apikey (authenticated) → create_hashed_apikey_for_user.

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
