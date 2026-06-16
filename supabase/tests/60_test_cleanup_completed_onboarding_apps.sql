BEGIN;

SELECT plan(12);

SELECT tests.authenticate_as_service_role();

-- Fixtures: onboarding apps in different states.
--   real.old     -> upload-ready real bundle, 20 days old   => should auto-complete
--   real.recent  -> upload-ready real bundle, 2 days old     => too young, stays pending
--   noreal.old   -> only a builtin placeholder               => no real upload, stays pending
--   demo.old     -> upload-ready but demo-tracked + demo/    => seeded demo, stays pending
--   noupload.old -> non-placeholder version, NO artifact     => not upload-ready, stays pending
INSERT INTO public.apps (
  id, owner_org, app_id, icon_url, name, user_id, need_onboarding, created_at
)
VALUES
  ('60000000-0000-0000-0000-000000000001', '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
   'com.test.onb.real.old', '', 'Real Old', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '20 days'),
  ('60000000-0000-0000-0000-000000000002', '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
   'com.test.onb.real.recent', '', 'Real Recent', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '2 days'),
  ('60000000-0000-0000-0000-000000000003', '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
   'com.test.onb.noreal.old', '', 'No Real Old', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '20 days'),
  ('60000000-0000-0000-0000-000000000004', '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
   'com.test.onb.demo.old', '', 'Demo Old', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '20 days'),
  ('60000000-0000-0000-0000-000000000005', '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
   'com.test.onb.noupload.old', '', 'No Upload Old', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '20 days');

-- real.old / real.recent: stored bundle with a real r2_path (upload-ready).
-- demo.old: also upload-ready, but it is demo-tracked (see onboarding_demo_data).
-- noupload.old: non-placeholder version with NO r2_path/external_url (metadata-only).
INSERT INTO public.app_versions (id, owner_org, created_at, app_id, name, user_id, deleted, storage_provider, r2_path, external_url)
VALUES
  (960001, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.real.old', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false, 'r2', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.test.onb.real.old/1.0.0.zip', NULL),
  (960002, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '2 days', 'com.test.onb.real.recent', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false, 'r2', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.test.onb.real.recent/1.0.0.zip', NULL),
  (960003, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.noreal.old', 'builtin', '6aa76066-55ef-4238-ade6-0b32334a4097', true, NULL, NULL, NULL),
  (960004, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.demo.old', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false, 'r2', 'demo/com.test.onb.demo.old/1.0.0.zip', NULL),
  (960005, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.noupload.old', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false, 'r2', NULL, NULL);

-- demo.old carries a demo/ manifest (so has_seeded_demo_data is true) ...
INSERT INTO public.manifest (app_version_id, file_name, s3_path, file_hash, file_size)
VALUES
  (960004, 'main.js', 'demo/com.test.onb.demo.old/1.0.0/main.js', repeat('c', 64), 123);

-- ... and is recorded as demo-seeded in the provenance table.
INSERT INTO public.onboarding_demo_data (app_id, owner_org, relation_name, row_key, seed_id)
VALUES
  ('com.test.onb.demo.old', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'app_versions', '960004', '70000000-0000-0000-0000-000000000001');

-- app_has_real_bundle distinguishes upload-ready real uploads from placeholders,
-- demo-tracked versions, and metadata-only (non-upload-ready) version rows.
SELECT ok(
  public.app_has_real_bundle('com.test.onb.real.old'),
  'app_has_real_bundle is true for an upload-ready real bundle'
);

SELECT ok(
  NOT public.app_has_real_bundle('com.test.onb.demo.old'),
  'app_has_real_bundle is false for a demo-tracked version (provenance)'
);

SELECT ok(
  NOT public.app_has_real_bundle('com.test.onb.noreal.old'),
  'app_has_real_bundle is false when only a builtin placeholder exists'
);

SELECT ok(
  NOT public.app_has_real_bundle('com.test.onb.noupload.old'),
  'app_has_real_bundle is false for a non-upload-ready (metadata-only) version'
);

SELECT ok(
  public.has_seeded_demo_data('com.test.onb.demo.old'),
  'has_seeded_demo_data is true for the seeded demo app'
);

-- Run the job.
SELECT public.cleanup_completed_onboarding_apps();

SELECT is(
  (SELECT need_onboarding FROM public.apps WHERE app_id = 'com.test.onb.real.old'),
  false,
  'real app older than 15 days is auto-completed'
);

SELECT is(
  (SELECT need_onboarding FROM public.apps WHERE app_id = 'com.test.onb.real.recent'),
  true,
  'real app younger than 15 days stays pending'
);

SELECT is(
  (SELECT need_onboarding FROM public.apps WHERE app_id = 'com.test.onb.noreal.old'),
  true,
  'app with no real upload stays pending'
);

SELECT is(
  (SELECT need_onboarding FROM public.apps WHERE app_id = 'com.test.onb.demo.old'),
  true,
  'seeded demo app stays pending'
);

SELECT is(
  (SELECT need_onboarding FROM public.apps WHERE app_id = 'com.test.onb.noupload.old'),
  true,
  'app with a metadata-only (non-upload-ready) version stays pending'
);

-- Flipping the flag fires the existing provenance-based cleanup, which has no
-- demo rows tracked for this app, so the real bundle must survive untouched.
SELECT is(
  (SELECT count(*)::integer FROM public.app_versions
   WHERE app_id = 'com.test.onb.real.old' AND name = '1.0.0' AND deleted = false),
  1,
  'auto-completion preserves the real bundle (provenance cleanup deletes nothing)'
);

SELECT ok(
  (
    SELECT count(*)::int
    FROM public.cron_tasks
    WHERE name = 'cleanup_completed_onboarding_apps'
      AND enabled = TRUE
      AND task_type = 'function'::public.cron_task_type
      AND target = 'public.cleanup_completed_onboarding_apps()'
      AND hour_interval IS NULL
      AND run_at_hour = 4
      AND run_at_minute = 0
  ) = 1,
  'cron_tasks registers the daily onboarding auto-complete job'
);

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
