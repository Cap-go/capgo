BEGIN;

SELECT plan(7);

SELECT tests.authenticate_as_service_role();

INSERT INTO public.apps (
  id,
  owner_org,
  app_id,
  icon_url,
  name,
  user_id,
  need_onboarding,
  created_at
)
VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'com.test.demo.expired.seeded',
    '',
    'Expired Seeded Demo App',
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    true,
    now() - interval '15 days'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'com.test.demo.expired.pending',
    '',
    'Expired Plain Onboarding App',
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    true,
    now() - interval '15 days'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'com.test.demo.recent.seeded',
    '',
    'Recent Seeded Demo App',
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    true,
    now() - interval '2 days'
  );

INSERT INTO public.app_versions (id, owner_org, created_at, app_id, name, user_id, deleted)
VALUES
  (920101, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '15 days', 'com.test.demo.expired.seeded', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false),
  (920102, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '15 days', 'com.test.demo.expired.pending', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false),
  (920103, '046a36ac-e03c-4590-9257-bd6c9dba9ee8', now() - interval '2 days', 'com.test.demo.recent.seeded', '1.0.0', '6aa76066-55ef-4238-ade6-0b32334a4097', false);

INSERT INTO public.manifest (app_version_id, file_name, s3_path, file_hash, file_size)
VALUES
  (920101, 'main.js', 'demo/com.test.demo.expired.seeded/1.0.0/main.js', repeat('a', 64), 123),
  (920103, 'main.js', 'demo/com.test.demo.recent.seeded/1.0.0/main.js', repeat('b', 64), 123);

INSERT INTO public.app_metrics_cache (org_id, start_date, end_date, response)
VALUES
  (
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    CURRENT_DATE - 7,
    CURRENT_DATE,
    '{"apps":[]}'::jsonb
  ),
  (
    '34a8c55d-2d0f-4652-a43f-684c7a9403ac',
    CURRENT_DATE - 7,
    CURRENT_DATE,
    '{"apps":[]}'::jsonb
  );

SELECT ok(
  public.has_seeded_demo_data('com.test.demo.expired.seeded'),
  'has_seeded_demo_data detects seeded demo manifests'
);

SELECT ok(
  NOT public.has_seeded_demo_data('com.test.demo.expired.pending'),
  'has_seeded_demo_data ignores plain onboarding apps'
);

SELECT public.cleanup_expired_demo_apps();

SELECT is(
  (SELECT count(*)::integer FROM public.apps WHERE app_id = 'com.test.demo.expired.seeded'),
  0,
  'expired seeded demo apps are deleted'
);

SELECT is(
  (SELECT count(*)::integer FROM public.apps WHERE app_id = 'com.test.demo.expired.pending'),
  1,
  'expired onboarding apps without demo data are preserved'
);

SELECT is(
  (SELECT count(*)::integer FROM public.apps WHERE app_id = 'com.test.demo.recent.seeded'),
  1,
  'recent seeded demo apps are preserved'
);

SELECT is(
  (SELECT count(*)::integer FROM public.app_metrics_cache WHERE org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
  0,
  'cleanup evicts metrics cache for affected orgs'
);

SELECT is(
  (SELECT count(*)::integer FROM public.app_metrics_cache WHERE org_id = '34a8c55d-2d0f-4652-a43f-684c7a9403ac'),
  1,
  'cleanup only evicts metrics cache for affected orgs'
);

SELECT * FROM finish();

ROLLBACK;
