CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions"()
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM "public"."app_versions"
  WHERE "app_versions"."deleted" = true
    AND "app_versions"."deleted_at" IS NOT NULL
    AND "app_versions"."deleted_at" <= pg_catalog.now() - INTERVAL '90 days'
    AND "app_versions"."name" NOT IN ('builtin', 'unknown')
    AND "app_versions"."manifest_count" = 0
    AND (
      "app_versions"."r2_path" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "public"."app_versions_meta"
        WHERE "app_versions_meta"."id" = "app_versions"."id"
          AND "app_versions_meta"."size" = 0
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channels"
      WHERE "channels"."version" = "app_versions"."id"
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
  END IF;
END;
$$;

ALTER FUNCTION "public"."delete_old_deleted_versions"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_old_deleted_versions"() IS
  'Permanently deletes app_versions that have been soft-deleted for at least 90 days after storage cleanup is reflected in app_versions_meta and app_versions.manifest_count.';

REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM anon;
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."delete_old_deleted_versions"() TO service_role;

DO $$
DECLARE
  updated_count bigint;
BEGIN
  UPDATE "public"."cron_tasks"
  SET
    "description" = 'Permanently delete app versions 90 days after soft delete',
    "task_type" = 'function'::"public"."cron_task_type",
    "target" = 'public.delete_old_deleted_versions()',
    "batch_size" = NULL,
    "payload" = NULL,
    "second_interval" = NULL,
    "minute_interval" = NULL,
    "hour_interval" = NULL,
    "run_at_hour" = 3,
    "run_at_minute" = 0,
    "run_at_second" = 0,
    "run_on_dow" = NULL,
    "run_on_day" = NULL,
    "enabled" = true,
    "updated_at" = pg_catalog.now()
  WHERE "name" = 'delete_old_versions';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'cron_tasks row with name = delete_old_versions not found';
  END IF;
END;
$$;
