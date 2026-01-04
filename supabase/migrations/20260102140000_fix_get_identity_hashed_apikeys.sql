-- ============================================================================
-- Fix get_identity functions to support hashed API keys
-- ============================================================================
-- The get_identity functions are used by RLS policies to resolve user identity
-- from API keys. Previously, they only checked the plain 'key' column, which
-- breaks hashed API keys (where key is NULL and key_hash contains the SHA-256).
--
-- This migration updates all get_identity functions to use find_apikey_by_value()
-- which checks both plain and hashed keys.
-- ============================================================================

-- ============================================================================
-- Section 1: Update get_identity(keymode key_mode[])
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RETURN NULL;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

-- ============================================================================
-- Section 2: Update get_identity_apikey_only(keymode key_mode[])
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RETURN NULL;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

-- ============================================================================
-- Section 3: Update get_identity_org_allowed(keymode key_mode[], org_id uuid)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_ORG_NO_AUTH', jsonb_build_object('org_id', org_id));
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    -- Check org restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: IDENTITY_ORG_UNALLOWED', jsonb_build_object('org_id', org_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_ORG_NO_MATCH', jsonb_build_object('org_id', org_id));
  RETURN NULL;
End;
$$;

-- ============================================================================
-- Section 4: Update get_identity_org_appid(keymode, org_id, app_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) RETURNS "uuid"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_APP_NO_AUTH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id, 'app_id', app_id));
      RETURN NULL;
    END IF;

    -- Check org restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: IDENTITY_APP_ORG_UNALLOWED', jsonb_build_object('org_id', org_id, 'app_id', app_id));
        RETURN NULL;
      END IF;
    END IF;

    -- Check app restrictions
    IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
      IF NOT (app_id = ANY(api_key.limited_to_apps)) THEN
        PERFORM public.pg_log('deny: IDENTITY_APP_UNALLOWED', jsonb_build_object('app_id', app_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_APP_NO_MATCH', jsonb_build_object('org_id', org_id, 'app_id', app_id));
  RETURN NULL;
End;
$$;

-- ============================================================================
-- Section 5: Grant execute on find_apikey_by_value to anon and authenticated
-- ============================================================================
-- The function was previously only granted to service_role, but it needs to
-- be callable from RLS policies which run as anon/authenticated

GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "authenticated";
