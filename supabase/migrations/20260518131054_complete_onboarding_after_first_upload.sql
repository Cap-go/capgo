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
    AND name NOT IN ('builtin', 'unknown')
    AND (
      p_preserve_app_version_id IS NULL
      OR id IS DISTINCT FROM p_preserve_app_version_id
    );

  INSERT INTO public.app_versions (
    owner_org,
    deleted,
    name,
    app_id,
    created_at
  )
  VALUES
    (v_owner_org, true, 'builtin', v_app_id, now()),
    (v_owner_org, true, 'unknown', v_app_id, now())
  ON CONFLICT (name, app_id) DO UPDATE
  SET
    owner_org = EXCLUDED.owner_org,
    deleted = true,
    deleted_at = NULL,
    checksum = NULL,
    session_key = NULL,
    r2_path = NULL,
    link = NULL,
    comment = NULL,
    updated_at = now();

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

CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid")
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.clear_onboarding_app_data(p_app_uuid, NULL::bigint);
END;
$$;

ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."cleanup_onboarding_app_data_on_complete"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_preserve_setting text;
  v_preserve_app_version_id bigint;
BEGIN
  IF OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE THEN
    v_preserve_setting := current_setting('capgo.onboarding_preserve_app_version_id', true);
    v_preserve_app_version_id := NULLIF(v_preserve_setting, '')::bigint;

    PERFORM public.clear_onboarding_app_data(NEW.id, v_preserve_app_version_id);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() FROM PUBLIC;

DROP TRIGGER IF EXISTS "cleanup_onboarding_app_data_on_complete" ON "public"."apps";

CREATE TRIGGER "cleanup_onboarding_app_data_on_complete"
AFTER UPDATE OF "need_onboarding"
ON "public"."apps"
FOR EACH ROW
WHEN (OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE)
EXECUTE FUNCTION "public"."cleanup_onboarding_app_data_on_complete"();

CREATE OR REPLACE FUNCTION "public"."complete_onboarding_after_first_upload"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_uuid uuid;
BEGIN
  IF NEW.name IN ('builtin', 'unknown') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.deleted, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (NEW.storage_provider = 'external' AND NULLIF(BTRIM(COALESCE(NEW.external_url, '')), '') IS NOT NULL)
    OR (NEW.storage_provider <> 'r2-direct' AND NULLIF(BTRIM(COALESCE(NEW.r2_path, '')), '') IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_app_uuid
  FROM public.apps
  WHERE app_id = NEW.app_id
    AND owner_org = NEW.owner_org
    AND need_onboarding IS TRUE
  LIMIT 1;

  IF v_app_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('capgo.onboarding_preserve_app_version_id', NEW.id::text, true);

  UPDATE public.apps
  SET need_onboarding = false
  WHERE id = v_app_uuid
    AND need_onboarding IS TRUE;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."complete_onboarding_after_first_upload"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."complete_onboarding_after_first_upload"() FROM PUBLIC;

DROP TRIGGER IF EXISTS "complete_onboarding_after_first_upload" ON "public"."app_versions";

CREATE TRIGGER "complete_onboarding_after_first_upload"
AFTER INSERT OR UPDATE OF "deleted", "external_url", "r2_path", "storage_provider", "name", "app_id", "owner_org"
ON "public"."app_versions"
FOR EACH ROW
WHEN (
  NEW.name NOT IN ('builtin', 'unknown')
  AND COALESCE(NEW.deleted, false) IS FALSE
  AND (
    (NEW.storage_provider = 'external' AND NULLIF(BTRIM(COALESCE(NEW.external_url, '')), '') IS NOT NULL)
    OR (NEW.storage_provider <> 'r2-direct' AND NULLIF(BTRIM(COALESCE(NEW.r2_path, '')), '') IS NOT NULL)
  )
)
EXECUTE FUNCTION "public"."complete_onboarding_after_first_upload"();
