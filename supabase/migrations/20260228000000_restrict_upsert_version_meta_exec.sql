-- ==========================================================================
-- Restrict upsert_version_meta execute rights to service role only
-- ==========================================================================
REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint)
FROM
  "anon",
  "authenticated";

GRANT
EXECUTE ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint)
TO
  "service_role";
