-- Auto-complete onboarding for apps that clearly finished real onboarding.
--
-- Problem: apps created via the dashboard onboarding flow are flagged
-- apps.need_onboarding = true and the flag is only ever cleared by `capgo init`
-- or an explicit dashboard PUT. Users who set up a real app any other way
-- (normal bundle uploads) stay flagged forever and keep seeing the "still in
-- onboarding / demo data is temporary" banner on a real, in-use app.
--
-- Safety: flipping need_onboarding -> false fires the existing
-- cleanup_onboarding_app_data_on_complete trigger, which calls
-- clear_onboarding_app_data -> reset_onboarding_demo_app_data. As of migration
-- 20260519123613 that path is PROVENANCE-BASED: it deletes only rows explicitly
-- fingerprinted as demo-seeded (tracked in onboarding_demo_data) and RAISE
-- EXCEPTIONs rather than cascade into any untracked/real row. This migration
-- therefore does NOT touch clear_onboarding_app_data -- it relies on that
-- existing safe cleanup and only flips the flag.
--
-- To stay robust if the provenance reset raises for one app (e.g. real data is
-- attached to demo-tracked rows), the flip is done per-app inside an exception
-- block: a failing app is skipped, never blocking the others, and no data is
-- lost.

-- Real-bundle detector: true when an app has at least one UPLOAD-READY, real
-- bundle. "Upload-ready" reuses the predicate the (reverted)
-- complete_onboarding_after_first_upload trigger used -- an external bundle with
-- a non-blank external_url, or a stored bundle with a non-blank r2_path -- so
-- metadata-only version rows (e.g. `--dry-upload`, or a created-but-not-finished
-- upload) do NOT qualify. Demo-seeded versions are excluded via the
-- onboarding_demo_data provenance table (the authoritative demo marker), and
-- 'builtin'/'unknown' placeholders are never counted. Used only to SELECT apps
-- that have genuinely shipped a real upload.
CREATE OR REPLACE FUNCTION public.app_has_real_bundle(p_app_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_versions v
    WHERE v.app_id = p_app_id
      AND v.deleted = false
      AND v.name NOT IN ('builtin', 'unknown')
      AND (
        (v.storage_provider = 'external' AND NULLIF(BTRIM(COALESCE(v.external_url, '')), '') IS NOT NULL)
        OR (v.storage_provider <> 'r2-direct' AND NULLIF(BTRIM(COALESCE(v.r2_path, '')), '') IS NOT NULL)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.onboarding_demo_data odd
        WHERE odd.app_id = p_app_id
          AND odd.relation_name = 'app_versions'
          AND odd.row_key = v.id::text
      )
  );
$$;

ALTER FUNCTION public.app_has_real_bundle(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.app_has_real_bundle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_real_bundle(text) TO service_role;

-- Daily auto-complete of finished onboarding apps.
CREATE OR REPLACE FUNCTION public.cleanup_completed_onboarding_apps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app record;
  v_completed integer := 0;
  v_skipped integer := 0;
BEGIN
  -- Target apps that clearly finished real onboarding: an upload-ready real
  -- bundle, created more than 15 days ago, and not still carrying seeded demo
  -- data.
  FOR v_app IN
    SELECT id, app_id
    FROM public.apps
    WHERE need_onboarding IS TRUE
      AND created_at < now() - interval '15 days'
      AND NOT public.has_seeded_demo_data(app_id)
      AND public.app_has_real_bundle(app_id)
  LOOP
    BEGIN
      -- Flipping the flag fires cleanup_onboarding_app_data_on_complete, whose
      -- provenance-based reset only removes tracked demo rows. The per-app
      -- exception block means that if that reset refuses (it would touch real
      -- data), this app is left pending and the batch continues -- never a
      -- partial delete, never a lost batch.
      UPDATE public.apps
      SET need_onboarding = false
      WHERE id = v_app.id;

      v_completed := v_completed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      RAISE WARNING 'cleanup_completed_onboarding_apps: left app % (%) pending: %',
        v_app.app_id, v_app.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'cleanup_completed_onboarding_apps: completed %, skipped %', v_completed, v_skipped;
END;
$$;

ALTER FUNCTION public.cleanup_completed_onboarding_apps() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_completed_onboarding_apps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_completed_onboarding_apps() TO service_role;

-- Register a DAILY cron task (consolidated cron_tasks system). The transition is
-- gated by created_at < now() - 15 days, so an app becomes eligible at most
-- once -- a daily pass is plenty; runs at 04:00 UTC, after cleanup_expired_demo_apps (03:00).
INSERT INTO public.cron_tasks (
  name,
  description,
  task_type,
  target,
  second_interval,
  minute_interval,
  hour_interval,
  run_at_hour,
  run_at_minute,
  run_at_second,
  run_on_dow,
  run_on_day
) VALUES (
  'cleanup_completed_onboarding_apps',
  'Daily: clear apps.need_onboarding for apps that finished real onboarding (upload-ready bundle, created >15 days ago, no seeded demo data)',
  'function',
  'public.cleanup_completed_onboarding_apps()',
  null,
  null,
  null,
  4,
  0,
  0,
  null,
  null
)
ON CONFLICT (name) DO UPDATE SET
  description = excluded.description,
  task_type = excluded.task_type,
  target = excluded.target,
  second_interval = excluded.second_interval,
  minute_interval = excluded.minute_interval,
  hour_interval = excluded.hour_interval,
  run_at_hour = excluded.run_at_hour,
  run_at_minute = excluded.run_at_minute,
  run_at_second = excluded.run_at_second,
  updated_at = NOW();
