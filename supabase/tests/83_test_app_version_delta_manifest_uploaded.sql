-- app_versions.delta_manifest_uploaded is derived from manifest_count and is
-- sticky: deletion cleanup resets manifest_count to 0 but must not hide that
-- the version was uploaded with a delta manifest.
BEGIN;

SELECT plan(6);

INSERT INTO public.app_versions (
    app_id, name, owner_org, storage_provider, external_url, delta_manifest_uploaded
)
VALUES (
    'com.demo.app',
    '9.9.9-delta-flag-test',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'external',
    'https://example.com/delta-flag-test.zip',
    true
);

SELECT
    is(
        (
            SELECT delta_manifest_uploaded FROM public.app_versions
            WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test'
        ),
        false,
        'insert ignores a client supplied flag without manifest entries'
    );

UPDATE public.app_versions
SET manifest_count = 3
WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test';

SELECT
    is(
        (
            SELECT delta_manifest_uploaded FROM public.app_versions
            WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test'
        ),
        true,
        'flag turns on once manifest_count > 0'
    );

UPDATE public.app_versions
SET manifest_count = 0, deleted = true
WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test';

SELECT
    is(
        (
            SELECT delta_manifest_uploaded FROM public.app_versions
            WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test'
        ),
        true,
        'deletion cleanup does not reset the flag'
    );

UPDATE public.app_versions
SET delta_manifest_uploaded = false
WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test';

SELECT
    is(
        (
            SELECT delta_manifest_uploaded FROM public.app_versions
            WHERE app_id = 'com.demo.app' AND name = '9.9.9-delta-flag-test'
        ),
        true,
        'the flag cannot be set back to false'
    );

SELECT
    is(
        (
            SELECT count(*)::int FROM public.app_versions
            WHERE manifest_count > 0 AND NOT delta_manifest_uploaded
        ),
        0,
        'every version with manifest entries is flagged'
    );

INSERT INTO public.app_versions (
    app_id, name, owner_org, storage_provider, external_url, manifest_count
)
VALUES (
    'com.demo.app',
    '9.9.8-delta-flag-test',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'external',
    'https://example.com/delta-flag-test-2.zip',
    2
);

SELECT
    is(
        (
            SELECT delta_manifest_uploaded FROM public.app_versions
            WHERE app_id = 'com.demo.app' AND name = '9.9.8-delta-flag-test'
        ),
        true,
        'insert with manifest entries sets the flag'
    );

SELECT * FROM finish();

ROLLBACK;
