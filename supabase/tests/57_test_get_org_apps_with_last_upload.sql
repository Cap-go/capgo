BEGIN;

SELECT plan(11);

-- get_org_apps_with_last_upload returns one org's apps with a derived last_upload_at,
-- enforces RLS (SECURITY INVOKER), and owns search/sort/pagination/total_count in SQL.

-- Demo org owns exactly one app (com.demo.app) in seed data.
-- last_version = '1.0.0' which maps to seeded app_versions id=3.

-- ---------------------------------------------------------------------------
-- Authenticated org member sees their org's app with the correct last_upload_at
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('test_user');

SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid)),
    1::bigint,
    'returns the single app owned by the demo org'
);

SELECT is(
    (SELECT app_id FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid)),
    'com.demo.app'::character varying,
    'returns the expected app_id'
);

-- last_upload_at must equal the created_at of the bundle matching last_version (id=3),
-- NOT apps.updated_at.
SELECT is(
    (SELECT last_upload_at FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid)),
    (SELECT created_at FROM public.app_versions WHERE id = 3),
    'last_upload_at is the matching bundle created_at, not apps.updated_at'
);

SELECT is(
    (SELECT total_count FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid)),
    1::bigint,
    'total_count reflects the full filtered set'
);

-- ---------------------------------------------------------------------------
-- Search filter
-- ---------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, 'com.demo')),
    1::bigint,
    'search matches by app_id substring'
);

SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, 'no-such-app-xyz')),
    0::bigint,
    'search with no match returns no rows'
);

SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, 'Demo')),
    1::bigint,
    'search matches by name substring (case-insensitive)'
);

-- ---------------------------------------------------------------------------
-- Pagination: limit/offset are honored, total_count stays constant
-- ---------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, NULL, 'last_upload_at', true, 10, 1)),
    0::bigint,
    'offset beyond the first page returns no rows for a single-app org'
);

-- ---------------------------------------------------------------------------
-- RLS isolation: a member of the demo org cannot see another org's apps
-- ---------------------------------------------------------------------------
SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'::uuid)),
    0::bigint,
    'caller cannot list apps of an org they do not belong to (RLS enforced)'
);

SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Anonymous (no auth, no api key) sees nothing
-- ---------------------------------------------------------------------------
SELECT set_config('request.headers', '{}', true);

SELECT is(
    (SELECT count(*) FROM public.get_org_apps_with_last_upload(
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid)),
    0::bigint,
    'anonymous caller without auth or api key sees no apps'
);

-- ---------------------------------------------------------------------------
-- Admin (super_admin via seed) of the demo-admin org sees its own app
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('test_admin');

SELECT is(
    (SELECT app_id FROM public.get_org_apps_with_last_upload(
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d'::uuid)),
    'com.demoadmin.app'::character varying,
    'admin org member lists their own org app'
);

SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
