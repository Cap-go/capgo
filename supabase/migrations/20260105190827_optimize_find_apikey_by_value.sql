-- ============================================================================
-- Optimize find_apikey_by_value to use a single query instead of two sequential queries
-- ============================================================================
-- The original implementation did:
--   1. First query: check plain-text key
--   2. Second query (if first fails): check hashed key
--
-- This optimization combines both checks into a single query using OR,
-- which is more efficient as it only requires one database round-trip
-- and PostgreSQL can potentially use index union optimization.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT * FROM public.apikeys
  WHERE key = key_value
     OR key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  LIMIT 1;
$$;
