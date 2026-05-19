BEGIN;

SELECT plan(12);

SELECT tests.authenticate_as_service_role();

INSERT INTO public.apps (
  id,
  owner_org,
  app_id,
  icon_url,
  name,
  user_id,
  need_onboarding
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
  'com.test.demo.cleanup',
  '',
  'Demo Cleanup App',
  '6aa76066-55ef-4238-ade6-0b32334a4097',
  true
);

INSERT INTO public.app_versions (id, owner_org, created_at, app_id, name, user_id, deleted)
VALUES
  (910101, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now(), 'com.test.demo.cleanup', 'builtin', '6aa76066-55ef-4238-ade6-0b32334a4097', true),
  (910102, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now(), 'com.test.demo.cleanup', 'unknown', '6aa76066-55ef-4238-ade6-0b32334a4097', true),
  (910103, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now(), 'com.test.demo.cleanup', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false);

INSERT INTO public.channels (
  id,
  owner_org,
  created_at,
  name,
  app_id,
  version,
  created_by
)
VALUES (
  910101,
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
  now(),
  'production',
  'com.test.demo.cleanup',
  910103,
  '6aa76066-55ef-4238-ade6-0b32334a4097'
);

INSERT INTO public.devices (
  updated_at,
  device_id,
  version,
  app_id,
  platform,
  plugin_version,
  os_version,
  version_build,
  version_name,
  custom_id,
  is_prod,
  is_emulator
)
VALUES (
  now(),
  'demo-cleanup-device',
  910103,
  'com.test.demo.cleanup',
  'ios',
  '6.0.0',
  '17.0',
  '1',
  '1.0.0',
  '',
  true,
  false
);

INSERT INTO public.channel_devices (channel_id, app_id, device_id, owner_org)
VALUES (
  910101,
  'com.test.demo.cleanup',
  'demo-cleanup-device',
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
);

INSERT INTO public.deploy_history (channel_id, app_id, version_id, created_by, owner_org)
VALUES (
  910101,
  'com.test.demo.cleanup',
  910103,
  '6aa76066-55ef-4238-ade6-0b32334a4097',
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
);

INSERT INTO public.daily_mau (app_id, date, mau)
VALUES ('com.test.demo.cleanup', CURRENT_DATE, 42);

INSERT INTO public.daily_bandwidth (app_id, date, bandwidth)
VALUES ('com.test.demo.cleanup', CURRENT_DATE, 42);

INSERT INTO public.daily_storage (app_id, date, storage)
VALUES ('com.test.demo.cleanup', CURRENT_DATE, 42);

INSERT INTO public.daily_version (app_id, date, version_id, version_name, get, install, fail, uninstall)
VALUES ('com.test.demo.cleanup', CURRENT_DATE, 910103, '1.0.0', 1, 1, 0, 0);

INSERT INTO public.build_requests (
  id,
  created_at,
  app_id,
  owner_org,
  platform,
  requested_by,
  status,
  build_mode,
  upload_url,
  upload_path,
  upload_session_key,
  upload_expires_at
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  now(),
  'com.test.demo.cleanup',
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
  'ios',
  '6aa76066-55ef-4238-ade6-0b32334a4097',
  'pending',
  'release',
  'https://example.com/build',
  'builds/demo-cleanup',
  'demo-cleanup-session',
  now() + interval '1 day'
);

UPDATE public.apps
SET
  need_onboarding = false
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (SELECT count(*)::integer FROM public.app_versions WHERE app_id = 'com.test.demo.cleanup'),
  2,
  'cleanup keeps only builtin and unknown versions'
);

SELECT results_eq(
  $$SELECT name FROM public.app_versions WHERE app_id = 'com.test.demo.cleanup' ORDER BY name$$,
  $$VALUES ('builtin'::character varying), ('unknown'::character varying)$$,
  'cleanup preserves builtin and unknown versions'
);

SELECT is(
  (SELECT count(*)::integer FROM public.channels WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo channels'
);

SELECT is(
  (SELECT count(*)::integer FROM public.channel_devices WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo channel devices'
);

SELECT is(
  (SELECT count(*)::integer FROM public.deploy_history WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo deploy history'
);

SELECT is(
  (SELECT count(*)::integer FROM public.devices WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo devices'
);

SELECT is(
  (SELECT count(*)::integer FROM public.daily_mau WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo mau stats'
);

SELECT is(
  (SELECT count(*)::integer FROM public.daily_bandwidth WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo bandwidth stats'
);

SELECT is(
  (SELECT count(*)::integer FROM public.daily_storage WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo storage stats'
);

SELECT is(
  (SELECT count(*)::integer FROM public.daily_version WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo version stats'
);

SELECT is(
  (SELECT count(*)::integer FROM public.build_requests WHERE app_id = 'com.test.demo.cleanup'),
  0,
  'cleanup removes demo build requests'
);

SELECT ok(
  (
    SELECT last_version IS NULL
      AND channel_device_count = 0
      AND manifest_bundle_count = 0
    FROM public.apps
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  'cleanup resets cached app counters'
);

SELECT * FROM finish();

ROLLBACK;
