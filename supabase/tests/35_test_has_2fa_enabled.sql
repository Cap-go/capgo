BEGIN;

SELECT plan(11);

-- Create test users
SELECT tests.create_supabase_user('test_user_with_2fa');
SELECT tests.create_supabase_user('test_user_without_2fa');
SELECT tests.create_supabase_user('test_user_with_unverified_2fa');

-- Get user IDs
DO $$
DECLARE
    user_with_2fa_id uuid;
    user_without_2fa_id uuid;
    user_unverified_2fa_id uuid;
BEGIN
    user_with_2fa_id := tests.get_supabase_uid('test_user_with_2fa');
    user_without_2fa_id := tests.get_supabase_uid('test_user_without_2fa');
    user_unverified_2fa_id := tests.get_supabase_uid('test_user_with_unverified_2fa');

    -- Insert verified MFA factor for test_user_with_2fa
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        user_with_2fa_id,
        'Test TOTP',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        now(),
        now()
    );

    -- Insert unverified MFA factor for test_user_with_unverified_2fa
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        user_unverified_2fa_id,
        'Test TOTP Unverified',
        'totp'::auth.factor_type,
        'unverified'::auth.factor_status,
        now(),
        now()
    );
END $$;

-- Test 1: has_2fa_enabled() for user WITH verified 2FA
SELECT tests.authenticate_as('test_user_with_2fa');

SELECT
    is(
        has_2fa_enabled(),
        true,
        'has_2fa_enabled() test - user with verified 2FA returns true'
    );

SELECT tests.clear_authentication();

-- Test 2: has_2fa_enabled() for user WITHOUT 2FA
SELECT tests.authenticate_as('test_user_without_2fa');

SELECT
    is(
        has_2fa_enabled(),
        false,
        'has_2fa_enabled() test - user without 2FA returns false'
    );

SELECT tests.clear_authentication();

-- Test 3: has_2fa_enabled() for user with UNVERIFIED 2FA
SELECT tests.authenticate_as('test_user_with_unverified_2fa');

SELECT
    is(
        has_2fa_enabled(),
        false,
        'has_2fa_enabled() test - user with unverified 2FA returns false'
    );

SELECT tests.clear_authentication();

-- Test 4: has_2fa_enabled(user_id) with service_role for user WITH verified 2FA
SELECT tests.authenticate_as_service_role();

SELECT
    is(
        has_2fa_enabled(tests.get_supabase_uid('test_user_with_2fa')),
        true,
        'has_2fa_enabled(user_id) test - service_role can check user with verified 2FA returns true'
    );

-- Test 5: has_2fa_enabled(user_id) with service_role for user WITHOUT 2FA
SELECT
    is(
        has_2fa_enabled(tests.get_supabase_uid('test_user_without_2fa')),
        false,
        'has_2fa_enabled(user_id) test - service_role can check user without 2FA returns false'
    );

-- Test 6: has_2fa_enabled(user_id) with service_role for user with UNVERIFIED 2FA
SELECT
    is(
        has_2fa_enabled(tests.get_supabase_uid('test_user_with_unverified_2fa')),
        false,
        'has_2fa_enabled(user_id) test - service_role can check user with unverified 2FA returns false'
    );

SELECT tests.clear_authentication();

-- Test 7: Regular authenticated user CANNOT call has_2fa_enabled(user_id)
SELECT tests.authenticate_as('test_user_with_2fa');

SELECT
    throws_ok(
        format('SELECT has_2fa_enabled(''%s'')', tests.get_supabase_uid('test_user_without_2fa')),
        'permission denied for function has_2fa_enabled',
        'has_2fa_enabled(user_id) test - authenticated user cannot call function with user_id parameter'
    );

SELECT tests.clear_authentication();

-- Test 8: Anon user CANNOT call has_2fa_enabled(user_id)
SELECT tests.clear_authentication();

SELECT
    throws_ok(
        format('SELECT has_2fa_enabled(''%s'')', tests.get_supabase_uid('test_user_without_2fa')),
        'permission denied for function has_2fa_enabled',
        'has_2fa_enabled(user_id) test - anon user cannot call function with user_id parameter'
    );

-- Test 9: has_2fa_enabled() for anon user (no authentication)
SELECT
    is(
        has_2fa_enabled(),
        false,
        'has_2fa_enabled() test - anon user returns false'
    );

-- Test 10: Verify function exists and has correct signature
SELECT
    ok(
        pg_get_functiondef('has_2fa_enabled()'::regprocedure) IS NOT NULL,
        'has_2fa_enabled() test - function exists'
    );

SELECT
    ok(
        pg_get_functiondef('has_2fa_enabled(uuid)'::regprocedure) IS NOT NULL,
        'has_2fa_enabled(user_id) test - function exists'
    );

SELECT *
FROM
    finish();

ROLLBACK;

