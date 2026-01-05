-- ============================================================================
-- Fix is_allowed_capgkey and get_user_id to support hashed API keys
-- ============================================================================
-- The is_allowed_capgkey functions are used by RLS policies to check if an
-- API key is valid for a given mode. Previously, they only checked the plain
-- 'key' column, which breaks hashed API keys (where key is NULL and key_hash
-- contains the SHA-256 hash).
--
-- Similarly, get_user_id only checked the plain 'key' column.
--
-- This migration updates these functions to use find_apikey_by_value()
-- which checks both plain and hashed keys, and adds expiration checking.
--
-- Also optimizes find_apikey_by_value to use a single query instead of two
-- sequential queries for better performance.
-- ============================================================================

-- ============================================================================
-- Section 1: Optimize find_apikey_by_value to use single query
-- ============================================================================
-- The original implementation did two sequential queries. This optimization
-- combines both checks into a single query using OR, which is more efficient
-- as it only requires one database round-trip and PostgreSQL can potentially
-- use index union optimization.

CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT * FROM public.apikeys
  WHERE key = key_value
     OR key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  LIMIT 1;
$$;

-- ============================================================================
-- Section 2: Update is_allowed_capgkey(apikey, keymode)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  -- Check if key was found and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================================================
-- Section 3: Update is_allowed_capgkey(apikey, keymode, app_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  -- Check if key was found and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN false;
    END IF;

    -- Check if user is app owner
    IF NOT public.is_app_owner(api_key.user_id, app_id) THEN
      RETURN false;
    END IF;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================================================
-- Section 4: Update get_user_id(apikey) to support hashed keys
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  IF api_key.id IS NOT NULL THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN NULL;
    END IF;
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;
