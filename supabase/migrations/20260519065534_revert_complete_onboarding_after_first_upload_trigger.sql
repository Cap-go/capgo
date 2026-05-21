-- Closes the onboarding-cleanup data-loss cascade introduced by
-- 20260518131054 (PR #2291). See issue #2295 for the full incident report.
--
-- Two changes:
--
-- 1. Drop the `complete_onboarding_after_first_upload` trigger and its
--    function. That trigger flipped `apps.need_onboarding = FALSE` on the
--    first real bundle upload, which fires the pre-existing
--    `cleanup_onboarding_app_data_on_complete` trigger and cascades into
--    `clear_onboarding_app_data()` -- wiping channels, bundles, devices,
--    deploy history, and daily metrics for the app. Any app where
--    `need_onboarding` was still TRUE (i.e. provisioned via dashboard or
--    CI without ever running `capgo init`) was silently armed.
--
-- 2. Add a production-safety guard to `clear_onboarding_app_data` so it
--    refuses to delete data for apps that show any sign of real
--    production use. This is defense-in-depth: even if some other code
--    path (now or in the future) flips `need_onboarding` -> FALSE on a
--    real app (e.g. `capgo init` against a long-lived dashboard-created
--    app), the cleanup itself is now safe -- it will RAISE WARNING and
--    return without deleting anything.
--
-- The guard checks four independent signals; any one of them means the
-- app is not a fresh onboarding placeholder:
--   * any row in `public.devices` (a real client registered)
--   * any row in `public.channel_devices` (a device is on a channel)
--   * any row in `public.deploy_history` beyond the preserved version
--   * any channel whose `version` points at a bundle other than the
--     preserved one (a real channel is wired to bundle history)

DROP TRIGGER IF EXISTS "complete_onboarding_after_first_upload" ON "public"."app_versions";

DROP FUNCTION IF EXISTS "public"."complete_onboarding_after_first_upload"();

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
