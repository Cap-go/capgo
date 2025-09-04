BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (12);

-- Test 0: Check if the function returns the correct supabase_uid from the seed data
SELECT
    is (
        tests.get_supabase_uid ('test_admin'),
        'c591b04e-cf29-4945-b9a0-776d0672061a',
        'test get_supabase_uid - test_admin'
    );

SELECT
    is (
        tests.get_supabase_uid ('test_user'),
        '6aa76066-55ef-4238-ade6-0b32334a4097',
        'test get_supabase_uid - test_user1'
    );

SELECT
    is (
        tests.get_supabase_uid ('test_user2'),
        '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
        'test get_supabase_uid - test_user2'
    );

SELECT
    tests.authenticate_as ('test_user2');

SELECT
    is (
        verify_mfa (),
        true,
        'test verify_mfa - test_user2'
    );

SELECT
    is (
        coalesce(
            nullif(
                current_setting('request.jwt.claim.sub', true),
                ''
            ),
            (
                nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
            )
        )::uuid,
        '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
        'test if authenticate_as works'
    );

SELECT
    is (
        (
            SELECT
                id
            FROM
                orgs
            LIMIT
                1
        ),
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        'test get supabase_uid - org created by test_admin'
    );

SELECT
    tests.clear_authentication ();

-- Test 1: Check if the function returns 'NO_INVITE' when there's no invite
SELECT
    tests.authenticate_as ('test_user');

SELECT
    is (
        accept_invitation_to_org (
            (
                SELECT
                    id
                FROM
                    orgs
                WHERE
                    created_by = tests.get_supabase_uid ('test_admin')
            )
        ),
        'NO_INVITE',
        'accept_invitation_to_org test - no invite'
    );

SELECT
    tests.clear_authentication ();

-- Test 2: Check if the function returns 'INVALID_ROLE' when the user_right is not an invite role
SELECT
    tests.authenticate_as ('test_admin');

SELECT
    is (
        invite_user_to_org (
            'test3@capgo.app',
            (
                SELECT
                    id
                FROM
                    orgs
                WHERE
                    created_by = tests.get_supabase_uid ('test_admin')
            ),
            'read'
        ),
        'NO_EMAIL',
        'invite_user_to_org test - no email'
    );

SELECT
    tests.clear_authentication ();

-- Test 2: Check if the function returns 'INVALID_ROLE' when the user_right is not an invite role
SELECT
    tests.authenticate_as ('test_admin');

SELECT
    is (
        invite_user_to_org (
            'test@capgo.app',
            (
                SELECT
                    id
                FROM
                    orgs
                WHERE
                    created_by = tests.get_supabase_uid ('test_admin')
            ),
            'read'
        ),
        'OK',
        'invite_user_to_org test - valid input'
    );

SELECT
    tests.clear_authentication ();

SELECT
    tests.authenticate_as ('test_user');

SELECT
    is (
        accept_invitation_to_org (
            (
                SELECT
                    id
                FROM
                    orgs
                WHERE
                    created_by = tests.get_supabase_uid ('test_admin')
            )
        ),
        'INVALID_ROLE',
        'accept_invitation_to_org test - invalid role'
    );

SELECT
    tests.clear_authentication ();

-- -- Test 3: Check if the function updates the user_right correctly and returns 'OK' when given a valid invite
SELECT
    tests.authenticate_as ('test_admin');

UPDATE org_users
SET
    user_right = 'invite_admin'
WHERE
    user_id = tests.get_supabase_uid ('test_user');

SELECT
    tests.clear_authentication ();

SELECT
    tests.authenticate_as ('test_user');

SELECT
    is (
        accept_invitation_to_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        'OK',
        'accept_invitation_to_org test - valid input'
    );

SELECT
    is (
        (
            SELECT
                user_right
            FROM
                org_users
            WHERE
                user_id = tests.get_supabase_uid ('test_user')
                AND org_id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ),
        'admin'::user_min_right,
        'accept_invitation_to_org test - user_right updated'
    );

SELECT
    tests.clear_authentication ();

SELECT
    *
FROM
    finish ();

ROLLBACK;
