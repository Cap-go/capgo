-- ============================================================================
-- Fix is_bundle_encrypted to treat empty/whitespace session_key as not encrypted
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_bundle_encrypted"(
  "session_key" text
) RETURNS boolean
LANGUAGE "plpgsql" IMMUTABLE
SET "search_path" TO ''
AS $$
BEGIN
  -- A bundle is considered encrypted if session_key is non-null and non-empty
  RETURN session_key IS NOT NULL AND length(btrim(session_key)) > 0;
END;
$$;

ALTER FUNCTION "public"."is_bundle_encrypted"(text) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."is_bundle_encrypted"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_bundle_encrypted"(text) TO "service_role";
