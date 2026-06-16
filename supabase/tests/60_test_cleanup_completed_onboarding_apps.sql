BEGIN;

SELECT plan(10);

SELECT tests.authenticate_as_service_role();

-- Fixtures: four onboarding apps in different states.
--   real.old    -> real bundle, 20 days old        => should be auto-completed
--   real.recent -> real bundle, 2 days old         => too young, stays pending
--   noreal.old  -> only a builtin placeholder      => no real upload, stays pending
--   demo.old    -> seeded demo bundle (demo/ path) => seeded demo, stays pending
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
   'com.test.onb.demo.old', '', 'Demo Old', '6aa76066-55ef-4238-ade6-0b32334a4097', true, now() - interval '20 days');

INSERT INTO public.app_versions (id, owner_org, created_at, app_id, name, user_id, deleted)
VALUES
  (960001, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.real.old', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false),
  (960002, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '2 days', 'com.test.onb.real.recent', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false),
  (960003, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.noreal.old', 'builtin', '6aa76066-55ef-4238-ade6-0b32334a4097', true),
  (960004, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '20 days', 'com.test.onb.demo.old', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false);

-- real apps get a NON-demo manifest; the demo app gets a demo/ manifest.
INSERT INTO public.manifest (app_version_id, file_name, s3_path, file_hash, file_size)
VALUES
  (960001, 'main.js', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.test.onb.real.old/1.0.0/main.js', repeat('a', 64), 123),
  (960002, 'main.js', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.test.onb.real.recent/1.0.0/main.js', repeat('b', 64), 123),
  (960004, 'main.js', 'demo/com.test.onb.demo.old/1.0.0/main.js', repeat('c', 64), 123);

-- app_has_real_bundle distinguishes real uploads from placeholders and demo seeds.
SELECT ok(
  public.app_has_real_bundle('com.test.onb.real.old'),
  'app_has_real_bundle is true for an app with a real upload'
);

SELECT ok(
  NOT public.app_has_real_bundle('com.test.onb.demo.old'),
  'app_has_real_bundle is false for a seeded demo bundle (demo/ manifest)'
);

SELECT ok(
  NOT public.app_has_real_bundle('com.test.onb.noreal.old'),
  'app_has_real_bundle is false when only a builtin placeholder exists'
);

SELECT ok(
  public.has_seeded_demo_data('com.test.onb.demo.old'),
  'has_seeded_demo_data is true for the seeded demo app'
);

-- Run the hourly job.
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
      AND hour_interval = 1
      AND run_at_minute = 0
  ) = 1,
  'cron_tasks registers the hourly onboarding auto-complete job'
);

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
