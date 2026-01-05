-- Tests for reject_access_due_to_2fa_for_app function
-- This function is PUBLIC and can be called by authenticated users and via API keys
BEGIN;

SELECT plan(13);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_2fa_user_app', '2fa_app@test.com');
  PERFORM tests.create_supabase_user('test_no_2fa_user_app', 'no2fa_app@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
    tests.get_supabase_uid('test_2fa_user_app'),
    '2fa_app@test.com',
    NOW(),
    NOW()
),
(
    tests.get_supabase_uid('test_no_2fa_user_app'),
    'no2fa_app@test.com',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create test orgs and apps
DO $$
DECLARE
    org_with_2fa_enforcement_id uuid;
    org_without_2fa_enforcement_id uuid;
    test_2fa_user_id uuid;
    test_no_2fa_user_id uuid;
BEGIN
    org_with_2fa_enforcement_id := gen_random_uuid();
    org_without_2fa_enforcement_id := gen_random_uuid();
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_app');
    test_no_2fa_user_id := tests.get_supabase_uid('test_no_2fa_user_app');

    -- Create org WITH 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_with_2fa_enforcement_id, test_2fa_user_id, '2FA Enforced Org App', '2fa_app@org.com', true);

    -- Create org WITHOUT 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_without_2fa_enforcement_id, test_2fa_user_id, 'No 2FA Org App', 'no2fa_app@org.com', false);

    -- Add members to org WITH 2FA enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_with_2fa_enforcement_id, test_2fa_user_id, 'admin'::public.user_min_right),
        (org_with_2fa_enforcement_id, test_no_2fa_user_id, 'read'::public.user_min_right);

    -- Add members to org WITHOUT 2FA enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_without_2fa_enforcement_id, test_2fa_user_id, 'admin'::public.user_min_right),
        (org_without_2fa_enforcement_id, test_no_2fa_user_id, 'read'::public.user_min_right);

    -- Create app in org WITH 2FA enforcement
    INSERT INTO public.apps (app_id, owner_org, name, icon_url)
    VALUES ('com.test.2fa.enforced.app', org_with_2fa_enforcement_id, 'Test 2FA Enforced App', 'https://example.com/icon.png');

    -- Create app in org WITHOUT 2FA enforcement
    INSERT INTO public.apps (app_id, owner_org, name, icon_url)
    VALUES ('com.test.no2fa.app', org_without_2fa_enforcement_id, 'Test No 2FA App', 'https://example.com/icon.png');

    -- Store org IDs and app IDs for later use
    PERFORM set_config('test.org_with_2fa_app', org_with_2fa_enforcement_id::text, false);
    PERFORM set_config('test.org_without_2fa_app', org_without_2fa_enforcement_id::text, false);
    PERFORM set_config('test.app_with_2fa', 'com.test.2fa.enforced.app', false);
    PERFORM set_config('test.app_without_2fa', 'com.test.no2fa.app', false);

    -- Create API key for test_2fa_user_app
    INSERT INTO public.apikeys (user_id, key, mode, name)
    VALUES (
        test_2fa_user_id,
        'test-2fa-apikey-for-app',
        'all'::public.key_mode,
        'Test 2FA API Key'
    );

    -- Create API key for test_no_2fa_user_app
    INSERT INTO public.apikeys (user_id, key, mode, name)
    VALUES (
        test_no_2fa_user_id,
        'test-no2fa-apikey-for-app',
        'all'::public.key_mode,
        'Test No 2FA API Key'
    );
END $$;

-- Set up MFA factors
DO $$
DECLARE
    test_2fa_user_id uuid;
BEGIN
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_app');

    -- Insert verified MFA factor for test_2fa_user_app
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        test_2fa_user_id,
        'Test TOTP App',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        NOW(),
        NOW()
    );
END $$;

-- ============================================================================
-- Tests for reject_access_due_to_2fa_for_app function
-- ============================================================================

-- Test 1: User WITH 2FA accessing app in org WITH 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        false,
        'reject_access_due_to_2fa_for_app test - user with 2FA accessing app in org with 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 2: User WITHOUT 2FA accessing app in org WITH 2FA enforcement returns true (rejection)
SELECT tests.authenticate_as('test_no_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        true,
        'reject_access_due_to_2fa_for_app test - user without 2FA accessing app in org with 2FA enforcement returns true'
    );
SELECT tests.clear_authentication();

-- Test 3: User WITH 2FA accessing app in org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app(
            current_setting('test.app_without_2fa')
        ),
        false,
        'reject_access_due_to_2fa_for_app test - user with 2FA accessing app in org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 4: User WITHOUT 2FA accessing app in org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_no_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app(
            current_setting('test.app_without_2fa')
        ),
        false,
        'reject_access_due_to_2fa_for_app test - user without 2FA accessing app in org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 5: Non-existent app returns true (rejection)
SELECT tests.authenticate_as('test_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app('com.nonexistent.app.12345'),
        true,
        'reject_access_due_to_2fa_for_app test - non-existent app returns true'
    );
SELECT tests.clear_authentication();

-- Test 6: User WITH 2FA using API key accessing app in org WITH 2FA enforcement returns false
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-2fa-apikey-for-app"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        false,
        'reject_access_due_to_2fa_for_app test - user with 2FA via API key accessing app in org with 2FA enforcement returns false'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 7: User WITHOUT 2FA using API key accessing app in org WITH 2FA enforcement returns true
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-no2fa-apikey-for-app"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        true,
        'reject_access_due_to_2fa_for_app test - user without 2FA via API key accessing app in org with 2FA enforcement returns true'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 8: User WITHOUT 2FA using API key accessing app in org WITHOUT 2FA enforcement returns false
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-no2fa-apikey-for-app"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_app(
            current_setting('test.app_without_2fa')
        ),
        false,
        'reject_access_due_to_2fa_for_app test - user without 2FA via API key accessing app in org without 2FA enforcement returns false'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 9: Anonymous user (no auth, no API key) returns true (rejection - no user identity found)
SELECT tests.clear_authentication();
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        true,
        'reject_access_due_to_2fa_for_app test - anonymous user returns true (no user identity)'
    );

-- Test 10: Verify function exists
SELECT
    ok(
        pg_get_functiondef(
            'reject_access_due_to_2fa_for_app(character varying)'::regprocedure
        ) IS NOT null,
        'reject_access_due_to_2fa_for_app test - function exists'
    );

-- Test 11: Service role CAN call the function
SELECT tests.authenticate_as_service_role();
SELECT
    ok(
        reject_access_due_to_2fa_for_app(
            current_setting('test.app_with_2fa')
        ) IS NOT null,
        'reject_access_due_to_2fa_for_app test - service_role can call function'
    );
SELECT tests.clear_authentication();

-- Test 12: User WITH 2FA accessing app multiple times (should always return false)
SELECT tests.authenticate_as('test_2fa_user_app');
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        false,
        'reject_access_due_to_2fa_for_app test - user with 2FA accessing app returns false (first call)'
    );
SELECT
    is(
        reject_access_due_to_2fa_for_app(current_setting('test.app_with_2fa')),
        false,
        'reject_access_due_to_2fa_for_app test - user with 2FA accessing app returns false (second call)'
    );
SELECT tests.clear_authentication();

SELECT *
FROM
    finish();

ROLLBACK;
