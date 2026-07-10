-- Stop storing synthetic native/no-bundle markers as rows in app_versions.
-- A NULL channels.version now represents a channel pointing at the app's builtin/native bundle.

ALTER TABLE "public"."channels"
  DROP CONSTRAINT IF EXISTS "channels_version_fkey";

ALTER TABLE "public"."channels"
  ALTER COLUMN "version" DROP NOT NULL;

ALTER TABLE "public"."channels"
  ADD CONSTRAINT "channels_version_fkey"
  FOREIGN KEY ("version")
  REFERENCES "public"."app_versions"("id")
  ON DELETE SET NULL;

UPDATE "public"."channels" AS "channels"
SET "version" = NULL
FROM "public"."app_versions" AS "app_versions"
WHERE "channels"."version" = "app_versions"."id"
  AND "app_versions"."name" IN ('builtin', 'unknown');

DELETE FROM "public"."app_versions"
WHERE "name" IN ('builtin', 'unknown');

CREATE OR REPLACE FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying)
RETURNS integer
LANGUAGE "plpgsql"
SET search_path = ''
AS $$
BEGIN
  PERFORM appid;
  RETURN NULL::integer;
END;
$$;

ALTER FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "service_role";

COMMENT ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) IS
'Legacy RPC kept for older clients. Native/builtin channel targets are represented by channels.version = NULL and this function must not recreate app_versions rows.';

CREATE OR REPLACE FUNCTION "public"."record_deployment_history"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Native/builtin channel targets are stored as NULL and cannot be represented
  -- in deploy_history.version_id. Record only concrete bundle deployments.
  IF OLD.version IS DISTINCT FROM NEW.version AND NEW.version IS NOT NULL THEN
    INSERT INTO public.deploy_history (
      channel_id,
      app_id,
      version_id,
      owner_org,
      created_by
    )
    VALUES (
      NEW.id,
      NEW.app_id,
      NEW.version,
      NEW.owner_org,
      COALESCE(public.get_identity()::uuid, NEW.created_by)
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."record_deployment_history"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM PUBLIC;
