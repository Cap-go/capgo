CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid")
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
BEGIN
  SELECT app_id, owner_org
  INTO v_app_id, v_owner_org
  FROM public.apps
  WHERE id = p_app_uuid;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.channel_devices
  WHERE app_id = v_app_id;

  DELETE FROM public.deploy_history
  WHERE app_id = v_app_id;

  DELETE FROM public.channels
  WHERE app_id = v_app_id;

  DELETE FROM public.devices
  WHERE app_id = v_app_id;

  DELETE FROM public.app_versions_meta
  WHERE app_id = v_app_id;

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
    AND name NOT IN ('builtin', 'unknown');

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

  UPDATE public.apps
  SET
    channel_device_count = 0,
    manifest_bundle_count = 0,
    last_version = NULL
  WHERE id = p_app_uuid;

  IF v_owner_org IS NOT NULL THEN
    DELETE FROM public.app_metrics_cache
    WHERE org_id = v_owner_org;
  END IF;
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
BEGIN
  IF OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE THEN
    PERFORM public.clear_onboarding_app_data(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "cleanup_onboarding_app_data_on_complete" ON "public"."apps";

CREATE TRIGGER "cleanup_onboarding_app_data_on_complete"
AFTER UPDATE OF "need_onboarding" ON "public"."apps"
FOR EACH ROW
WHEN (OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE)
EXECUTE FUNCTION "public"."cleanup_onboarding_app_data_on_complete"();

CREATE OR REPLACE FUNCTION "public"."cleanup_expired_demo_apps"()
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.apps
  WHERE need_onboarding IS TRUE
    AND created_at < now() - interval '14 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'cleanup_expired_demo_apps: Deleted % expired demo apps', deleted_count;
END;
$$;

ALTER FUNCTION "public"."cleanup_expired_demo_apps"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() FROM ANON;
REVOKE ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() FROM AUTHENTICATED;
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_demo_apps"() TO "service_role";

DROP FUNCTION IF EXISTS "public"."create_demo_app_with_limits"(
  "p_owner_org" "uuid",
  "p_user_id" "uuid",
  "p_app_id" "text",
  "p_name" "text",
  "p_icon_url" "text",
  "p_retention" bigint,
  "p_default_upload_channel" "text",
  "p_last_version" "text",
  "p_active_window_days" integer,
  "p_user_per_hour" integer,
  "p_org_per_hour" integer,
  "p_user_per_24h" integer,
  "p_org_per_24h" integer,
  "p_max_active_per_org" integer
);
