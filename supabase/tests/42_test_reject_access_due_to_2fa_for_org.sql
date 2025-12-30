-- Tests for reject_access_due_to_2fa_for_org function
-- This function is PUBLIC and can be called by authenticated users and via API keys
BEGIN;

SELECT plan(14);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_2fa_user_org', '2fa_org@test.com');
  PERFORM tests.create_supabase_user('test_no_2fa_user_org', 'no2fa_org@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
    tests.get_supabase_uid('test_2fa_user_org'),
    '2fa_org@test.com',
    now(),
    now()
),
(
    tests.get_supabase_uid('test_no_2fa_user_org'),
    'no2fa_org@test.com',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Create test orgs
DO $$
DECLARE
    org_with_2fa_enforcement_id uuid;
    org_without_2fa_enforcement_id uuid;
    test_2fa_user_id uuid;
    test_no_2fa_user_id uuid;
BEGIN
    org_with_2fa_enforcement_id := gen_random_uuid();
    org_without_2fa_enforcement_id := gen_random_uuid();
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_org');
    test_no_2fa_user_id := tests.get_supabase_uid('test_no_2fa_user_org');

    -- Create org WITH 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_with_2fa_enforcement_id, test_2fa_user_id, '2FA Enforced Org Direct', '2fa_org_direct@org.com', true);

    -- Create org WITHOUT 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_without_2fa_enforcement_id, test_2fa_user_id, 'No 2FA Org Direct', 'no2fa_org_direct@org.com', false);

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

    -- Store org IDs for later use
    PERFORM set_config('test.org_with_2fa_direct', org_with_2fa_enforcement_id::text, false);
    PERFORM set_config('test.org_without_2fa_direct', org_without_2fa_enforcement_id::text, false);

    -- Create API key for test_2fa_user_org
    INSERT INTO public.apikeys (user_id, key, mode, name)
    VALUES (
        test_2fa_user_id,
        'test-2fa-apikey-for-org',
        'all'::public.key_mode,
        'Test 2FA API Key Org'
    );

    -- Create API key for test_no_2fa_user_org
    INSERT INTO public.apikeys (user_id, key, mode, name)
    VALUES (
        test_no_2fa_user_id,
        'test-no2fa-apikey-for-org',
        'all'::public.key_mode,
        'Test No 2FA API Key Org'
    );

    -- Create org-limited API key for test_2fa_user_org (limited to org_without_2fa_enforcement only)
    INSERT INTO public.apikeys (user_id, key, mode, name, limited_to_orgs)
    VALUES (
        test_2fa_user_id,
        'test-2fa-apikey-org-limited',
        'all'::public.key_mode,
        'Test 2FA API Key Org Limited',
        ARRAY[org_without_2fa_enforcement_id]
    );
END $$;

-- Set up MFA factors
DO $$
DECLARE
    test_2fa_user_id uuid;
BEGIN
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_org');

    -- Insert verified MFA factor for test_2fa_user_org
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        test_2fa_user_id,
        'Test TOTP Org',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        now(),
        now()
    );
END $$;

-- ============================================================================
-- Tests for reject_access_due_to_2fa_for_org function
-- ============================================================================

-- Test 1: User WITH 2FA accessing org WITH 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        false,
        'reject_access_due_to_2fa_for_org test - user with 2FA accessing org with 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 2: User WITHOUT 2FA accessing org WITH 2FA enforcement returns true (rejection)
SELECT tests.authenticate_as('test_no_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        true,
        'reject_access_due_to_2fa_for_org test - user without 2FA accessing org with 2FA enforcement returns true'
    );
SELECT tests.clear_authentication();

-- Test 3: User WITH 2FA accessing org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(
            current_setting('test.org_without_2fa_direct')::uuid
        ),
        false,
        'reject_access_due_to_2fa_for_org test - user with 2FA accessing org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 4: User WITHOUT 2FA accessing org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as('test_no_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(
            current_setting('test.org_without_2fa_direct')::uuid
        ),
        false,
        'reject_access_due_to_2fa_for_org test - user without 2FA accessing org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 5: Non-existent org returns true (rejection)
SELECT tests.authenticate_as('test_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(gen_random_uuid()),
        true,
        'reject_access_due_to_2fa_for_org test - non-existent org returns true'
    );
SELECT tests.clear_authentication();

-- Test 6: User WITH 2FA using API key accessing org WITH 2FA enforcement returns false
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-2fa-apikey-for-org"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        false,
        'reject_access_due_to_2fa_for_org test - user with 2FA via API key accessing org with 2FA enforcement returns false'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 7: User WITHOUT 2FA using API key accessing org WITH 2FA enforcement returns true
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-no2fa-apikey-for-org"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        true,
        'reject_access_due_to_2fa_for_org test - user without 2FA via API key accessing org with 2FA enforcement returns true'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 8: User WITHOUT 2FA using API key accessing org WITHOUT 2FA enforcement returns false
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-no2fa-apikey-for-org"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_org(
            current_setting('test.org_without_2fa_direct')::uuid
        ),
        false,
        'reject_access_due_to_2fa_for_org test - user without 2FA via API key accessing org without 2FA enforcement returns false'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 9: Anonymous user (no auth, no API key) returns true (rejection - no user identity found)
SELECT tests.clear_authentication();
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        true,
        'reject_access_due_to_2fa_for_org test - anonymous user returns true (no user identity)'
    );

-- Test 10: Verify function exists
SELECT
    ok(
        pg_get_functiondef(
            'reject_access_due_to_2fa_for_org(uuid)'::regprocedure
        ) IS NOT null,
        'reject_access_due_to_2fa_for_org test - function exists'
    );

-- Test 11: Service role CAN call the function
SELECT tests.authenticate_as_service_role();
SELECT
    ok(
        reject_access_due_to_2fa_for_org(
            current_setting('test.org_with_2fa_direct')::uuid
        ) IS NOT null,
        'reject_access_due_to_2fa_for_org test - service_role can call function'
    );
SELECT tests.clear_authentication();

-- Test 12: User WITH 2FA accessing org multiple times (should always return false)
SELECT tests.authenticate_as('test_2fa_user_org');
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        false,
        'reject_access_due_to_2fa_for_org test - user with 2FA accessing org returns false (consistency check)'
    );
SELECT tests.clear_authentication();

-- Test 13: Org-limited API key accessing allowed org returns false (user has 2FA, org has no 2FA enforcement)
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-2fa-apikey-org-limited"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_without_2fa_direct')::uuid),
        false,
        'reject_access_due_to_2fa_for_org test - org-limited API key accessing allowed org returns false'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 14: Org-limited API key accessing disallowed org returns true (rejection - API key not allowed for this org)
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "test-2fa-apikey-org-limited"}', true);
END $$;
SELECT
    is(
        reject_access_due_to_2fa_for_org(current_setting('test.org_with_2fa_direct')::uuid),
        true,
        'reject_access_due_to_2fa_for_org test - org-limited API key accessing disallowed org returns true'
    );
DO $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
END $$;

SELECT *
FROM
    finish();

ROLLBACK;
