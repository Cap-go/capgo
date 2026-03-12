BEGIN;

SELECT plan(5);

SELECT
    tests.create_supabase_user(
        'shared_public_image_owner',
        'shared-public-owner@test.local'
    );

SELECT
    tests.create_supabase_user(
        'shared_public_image_unrelated',
        'shared-public-unrelated@test.local'
    );

SELECT tests.authenticate_as_service_role();

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
    tests.get_supabase_uid('shared_public_image_owner'),
    'shared-public-owner@test.local',
    now(),
    now()
),
(
    tests.get_supabase_uid('shared_public_image_unrelated'),
    'shared-public-unrelated@test.local',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
VALUES
(
    '55555555-5555-4555-8555-555555555555',
    tests.get_supabase_uid('shared_public_image_owner'),
    'Shared Public Images Org',
    'shared-public-owner@test.local',
    false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_users (user_id, org_id, user_right)
VALUES
(
    tests.get_supabase_uid('shared_public_image_owner'),
    '55555555-5555-4555-8555-555555555555',
    'admin'::public.user_min_right
)
ON CONFLICT DO NOTHING;

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES
(
    'com.shared.public.images',
    '',
    tests.get_supabase_uid('shared_public_image_owner'),
    'Shared Public Images App',
    '55555555-5555-4555-8555-555555555555'
)
ON CONFLICT (app_id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name)
VALUES
('images', 'public/capgo.png'),
(
    'images',
    'org/55555555-5555-4555-8555-555555555555/com.shared.public.images/icon'
)
ON CONFLICT (bucket_id, name) DO NOTHING;

SELECT tests.clear_authentication();

SELECT
    is(
        (
            SELECT count(*)
            FROM
                storage.objects
            WHERE
                bucket_id = 'images'
                AND name = 'public/capgo.png'
        ),
        1::bigint,
        'Anonymous users can read shared public images'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM
                storage.objects
            WHERE
                bucket_id = 'images'
                AND name
                = 'org/55555555-5555-4555-8555-555555555555/com.shared.public.images/icon'
        ),
        0::bigint,
        'Anonymous users cannot read app-scoped private images'
    );

SELECT tests.authenticate_as('shared_public_image_unrelated');

SELECT
    is(
        (
            SELECT count(*)
            FROM
                storage.objects
            WHERE
                bucket_id = 'images'
                AND name = 'public/capgo.png'
        ),
        1::bigint,
        'Authenticated users outside the app org can read shared public images'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM
                storage.objects
            WHERE
                bucket_id = 'images'
                AND name
                = 'org/55555555-5555-4555-8555-555555555555/com.shared.public.images/icon'
        ),
        0::bigint,
        'Authenticated users outside the app org cannot read app-scoped private images'
    );

SELECT tests.authenticate_as('shared_public_image_owner');

SELECT
    is(
        (
            SELECT count(*)
            FROM
                storage.objects
            WHERE
                bucket_id = 'images'
                AND name
                = 'org/55555555-5555-4555-8555-555555555555/com.shared.public.images/icon'
        ),
        1::bigint,
        'Authenticated app owners can still read their app-scoped private images'
    );

SELECT *
FROM
    finish();

ROLLBACK;
