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

CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
  v_last_version text;
  v_manifest_bundle_count bigint := 0;
  v_channel_device_count bigint := 0;
BEGIN
  SELECT app_id, owner_org
  INTO v_app_id, v_owner_org
  FROM public.apps
  WHERE id = p_app_uuid;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  -- Production-safety guard (issue #2295). Refuse to delete data for
  -- apps that look like real production. Any of these indicates the app
  -- is not a fresh onboarding placeholder.
  IF EXISTS (
    SELECT 1 FROM public.devices WHERE app_id = v_app_id
  ) OR EXISTS (
    SELECT 1 FROM public.channel_devices WHERE app_id = v_app_id
  ) OR EXISTS (
    SELECT 1 FROM public.deploy_history
    WHERE app_id = v_app_id
      AND (
        p_preserve_app_version_id IS NULL
        OR version_id IS DISTINCT FROM p_preserve_app_version_id
      )
  ) OR EXISTS (
    SELECT 1 FROM public.channels
    WHERE app_id = v_app_id
      AND version IS NOT NULL
      AND (
        p_preserve_app_version_id IS NULL
        OR version IS DISTINCT FROM p_preserve_app_version_id
      )
  ) THEN
    RAISE WARNING
      'clear_onboarding_app_data: refusing to clear app % -- production indicators present (see issue #2295)',
      v_app_id;
    RETURN;
  END IF;

  DELETE FROM public.channel_devices
  WHERE app_id = v_app_id
    AND (
      p_preserve_app_version_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.channels
        WHERE channels.id = channel_devices.channel_id
          AND channels.version = p_preserve_app_version_id
      )
    );

  DELETE FROM public.deploy_history
  WHERE app_id = v_app_id
    AND (
      p_preserve_app_version_id IS NULL
      OR version_id IS DISTINCT FROM p_preserve_app_version_id
    );

  DELETE FROM public.channels
  WHERE app_id = v_app_id
    AND (
      p_preserve_app_version_id IS NULL
      OR version IS DISTINCT FROM p_preserve_app_version_id
    );

  DELETE FROM public.devices
  WHERE app_id = v_app_id;

  DELETE FROM public.app_versions_meta
  WHERE app_id = v_app_id
    AND (
      p_preserve_app_version_id IS NULL
      OR id IS DISTINCT FROM p_preserve_app_version_id
    );

  DELETE FROM public.daily_version
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_bandwidth
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_storage
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_mau
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_build_time
  WHERE app_id = v_app_id;

  DELETE FROM public.build_requests
  WHERE app_id = v_app_id;

  DELETE FROM public.app_versions
  WHERE app_id = v_app_id
    AND (
      p_preserve_app_version_id IS NULL
      OR id IS DISTINCT FROM p_preserve_app_version_id
    );

  IF p_preserve_app_version_id IS NOT NULL THEN
    SELECT name, CASE WHEN manifest_count > 0 THEN 1 ELSE 0 END
    INTO v_last_version, v_manifest_bundle_count
    FROM public.app_versions
    WHERE id = p_preserve_app_version_id
      AND app_id = v_app_id
      AND deleted IS FALSE;

    SELECT COUNT(*)::bigint
    INTO v_channel_device_count
    FROM public.channel_devices
    INNER JOIN public.channels
      ON channels.id = channel_devices.channel_id
    WHERE channel_devices.app_id = v_app_id
      AND channels.version = p_preserve_app_version_id;
  END IF;

  UPDATE public.apps
  SET
    channel_device_count = v_channel_device_count,
    manifest_bundle_count = v_manifest_bundle_count,
    last_version = v_last_version
  WHERE id = p_app_uuid;

  IF v_owner_org IS NOT NULL THEN
    DELETE FROM public.app_metrics_cache
    WHERE org_id = v_owner_org;
  END IF;
END;
$$;

ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) TO "service_role";
