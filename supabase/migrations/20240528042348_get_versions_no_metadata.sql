CREATE OR REPLACE FUNCTION "public"."get_versions_with_no_metadata"() RETURNS setof app_versions 
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT app_versions.* FROM app_versions
  LEFT JOIN app_versions_meta ON app_versions_meta.id=app_versions.id
  where coalesce(app_versions_meta.size, 0) = 0
  AND app_versions.deleted=false
  AND app_versions.storage_provider != 'external'
  AND now() - app_versions.created_at > interval '120 seconds';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."process_failed_uploads"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  failed_version RECORD;
BEGIN
  FOR failed_version IN (
    SELECT * FROM get_versions_with_no_metadata()
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('version', failed_version)::text,
      '',
      'cron_clear_versions'
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."get_versions_with_no_metadata"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM "authenticated";
GRANT ALL ON FUNCTION "public"."process_failed_uploads"() TO "service_role";

SELECT cron.schedule(
  'process_failed_uploads', 
  '30 3 * * *', 
  $$SELECT process_failed_uploads();$$
);
