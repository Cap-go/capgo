-- Keep hard-deleted bundle cleanup bounded so manifest cascades do not create
-- one very large delete transaction when retention has a backlog.
CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions"() RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  WITH deleted_versions AS (
    SELECT "app_versions"."id"
    FROM "public"."app_versions"
    WHERE "app_versions"."deleted_at" IS NOT NULL
      AND "app_versions"."deleted_at" < now() - INTERVAL '3 months'
      AND "app_versions"."name" NOT IN ('builtin', 'unknown')
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."channels"
        WHERE "channels"."version" = "app_versions"."id"
      )
    ORDER BY "app_versions"."deleted_at", "app_versions"."id"
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM "public"."app_versions"
  USING deleted_versions
  WHERE "app_versions"."id" = deleted_versions."id";

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
  END IF;
END;
$$;

ALTER FUNCTION "public"."delete_old_deleted_versions"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."delete_old_deleted_versions"() IS 'Permanently deletes up to 500 soft-deleted app versions older than 3 months per run; related manifest rows cascade through foreign keys.';

REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_old_deleted_versions"() TO "service_role";
