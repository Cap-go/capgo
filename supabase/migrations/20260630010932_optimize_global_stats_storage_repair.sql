CREATE OR REPLACE FUNCTION "public"."total_bundle_storage_bytes"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT COALESCE(SUM(avm.size), 0)::bigint
  FROM public.app_versions_meta avm
  INNER JOIN public.app_versions av ON av.id = avm.id
  WHERE av.deleted = false;
$$;

ALTER FUNCTION "public"."total_bundle_storage_bytes"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."total_bundle_storage_bytes"() IS 'Returns active bundle storage in bytes from app_versions_meta.size for non-deleted app versions.';

REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM "service_role";
GRANT EXECUTE ON FUNCTION "public"."total_bundle_storage_bytes"() TO "service_role";
