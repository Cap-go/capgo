CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention" () RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    -- Use a more efficient approach with direct timestamp comparison
    UPDATE public.app_versions
    SET deleted = true
    WHERE app_versions.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) < 63113904
      AND app_versions.created_at < (
          SELECT NOW() - make_interval(secs => apps.retention)
          FROM public.apps
          WHERE apps.app_id = app_versions.app_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.channels
          WHERE channels.app_id = app_versions.app_id
            AND channels.version = app_versions.id
      );
END;
$$;

ALTER FUNCTION "public"."update_app_versions_retention" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_app_versions_retention" ()
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION "public"."update_app_versions_retention" ()
FROM
  anon;

REVOKE ALL ON FUNCTION "public"."update_app_versions_retention" ()
FROM
  authenticated;

GRANT
EXECUTE ON FUNCTION "public"."update_app_versions_retention" () TO postgres;

GRANT
EXECUTE ON FUNCTION "public"."update_app_versions_retention" () TO service_role;
