-- apps.channel_device_count / manifest_bundle_count are system-maintained:
-- client roles cannot write them, internal maintainers still can.
BEGIN;

SELECT plan(9);

CREATE TEMP TABLE tmp_apps_counter_guard_base AS
SELECT channel_device_count, manifest_bundle_count
FROM public.apps
WHERE app_id = 'com.demo.app';

GRANT SELECT ON tmp_apps_counter_guard_base TO authenticated;

SELECT tests.authenticate_as('test_user');

SELECT lives_ok(
  $$
    UPDATE public.apps
    SET channel_device_count = 999,
        manifest_bundle_count = 999,
        name = 'Counter guard rename'
    WHERE app_id = 'com.demo.app'
  $$,
  'app admin update with counters in SET list does not error'
);

SELECT is(
  (SELECT name FROM public.apps WHERE app_id = 'com.demo.app'),
  'Counter guard rename'::varchar,
  'app admin can still update regular app settings in the same statement'
);

SELECT is(
  (SELECT channel_device_count FROM public.apps WHERE app_id = 'com.demo.app'),
  (SELECT channel_device_count FROM tmp_apps_counter_guard_base),
  'app admin cannot change channel_device_count'
);

SELECT is(
  (SELECT manifest_bundle_count FROM public.apps WHERE app_id = 'com.demo.app'),
  (SELECT manifest_bundle_count FROM tmp_apps_counter_guard_base),
  'app admin cannot change manifest_bundle_count'
);

SELECT tests.clear_authentication();
RESET ROLE;

-- Legit maintainer: channel_devices insert -> queue -> processor.
INSERT INTO public.channel_devices (channel_id, app_id, device_id, owner_org)
SELECT id, app_id, 'counter-guard-device', owner_org
FROM public.channels
WHERE app_id = 'com.demo.app'
LIMIT 1;

SELECT is(
  public.process_channel_device_counts_queue(10),
  1::bigint,
  'queue processor applies the channel_devices delta'
);

SELECT is(
  (SELECT channel_device_count FROM public.apps WHERE app_id = 'com.demo.app'),
  (SELECT channel_device_count + 1 FROM tmp_apps_counter_guard_base),
  'channel_device_count still follows channel_devices changes'
);

-- SECURITY DEFINER rollup maintainer (runs as its owner).
SELECT public.refresh_app_rollups_after_demo_reset(
  (SELECT id FROM public.apps WHERE app_id = 'com.demo.app'),
  'com.demo.app',
  NULL
);

SELECT is(
  (SELECT channel_device_count FROM public.apps WHERE app_id = 'com.demo.app'),
  (SELECT count(*)::bigint FROM public.channel_devices WHERE app_id = 'com.demo.app'),
  'internal rollup refresh can still rewrite channel_device_count'
);

SELECT tests.authenticate_as_service_role();
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';

UPDATE public.apps
SET manifest_bundle_count = 7
WHERE app_id = 'com.demo.app';

SELECT is(
  (SELECT manifest_bundle_count FROM public.apps WHERE app_id = 'com.demo.app'),
  7::bigint,
  'service_role can update manifest_bundle_count'
);

RESET ROLE;
SELECT tests.clear_authentication();

-- Client inserts cannot seed non-zero counters.
SELECT tests.authenticate_as('test_user');

INSERT INTO public.apps (app_id, name, icon_url, owner_org, user_id, channel_device_count, manifest_bundle_count)
VALUES (
  'com.counter.guard.insert',
  'Counter guard insert',
  '',
  '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
  '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
  5,
  5
);

SELECT results_eq(
  $$
    SELECT channel_device_count, manifest_bundle_count
    FROM public.apps
    WHERE app_id = 'com.counter.guard.insert'
  $$,
  $$ VALUES (0::bigint, 0::bigint) $$,
  'client insert cannot seed counters'
);

SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
