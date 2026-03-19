ALTER TABLE "public"."apps"
  ADD COLUMN "need_onboarding" boolean NOT NULL DEFAULT false,
  ADD COLUMN "existing_app" boolean NOT NULL DEFAULT false,
  ADD COLUMN "ios_store_url" text,
  ADD COLUMN "android_store_url" text;

COMMENT ON COLUMN "public"."apps"."need_onboarding" IS 'True while the app is in the guided onboarding flow and may contain temporary onboarding/demo data.';
COMMENT ON COLUMN "public"."apps"."existing_app" IS 'True when the customer already has an existing mobile app and the CLI should not scaffold a fresh Capacitor app during onboarding.';
COMMENT ON COLUMN "public"."apps"."ios_store_url" IS 'Optional App Store URL collected during onboarding to prefill metadata for existing apps.';
COMMENT ON COLUMN "public"."apps"."android_store_url" IS 'Optional Google Play URL collected during onboarding to prefill metadata for existing apps.';

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

  DELETE FROM public.app_versions
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_version
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_bandwidth
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_storage
  WHERE app_id = v_app_id;

  DELETE FROM public.daily_mau
  WHERE app_id = v_app_id;

  DELETE FROM public.build_requests
  WHERE app_id = v_app_id;

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
