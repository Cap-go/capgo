BEGIN;

SELECT plan(12);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_2fa_user_reject', '2fa_reject@test.com');
  PERFORM tests.create_supabase_user('test_no_2fa_user_reject', 'no2fa_reject@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
    tests.get_supabase_uid('test_2fa_user_reject'),
    '2fa_reject@test.com',
    now(),
    now()
),
(
    tests.get_supabase_uid('test_no_2fa_user_reject'),
    'no2fa_reject@test.com',
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
    test_admin_id uuid;
BEGIN
    org_with_2fa_enforcement_id := extensions.uuid_generate_v4();
    org_without_2fa_enforcement_id := extensions.uuid_generate_v4();
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_reject');
    test_no_2fa_user_id := tests.get_supabase_uid('test_no_2fa_user_reject');
    test_admin_id := tests.get_supabase_uid('test_admin');

    -- Create org WITH 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_with_2fa_enforcement_id, test_admin_id, '2FA Enforced Org Reject', '2fa_reject@org.com', true);

    -- Create org WITHOUT 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_without_2fa_enforcement_id, test_admin_id, 'No 2FA Org Reject', 'no2fa_reject@org.com', false);

    -- Add members to org WITH 2FA enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_with_2fa_enforcement_id, test_2fa_user_id, 'read'::public.user_min_right),
        (org_with_2fa_enforcement_id, test_no_2fa_user_id, 'read'::public.user_min_right);

    -- Add members to org WITHOUT 2FA enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_without_2fa_enforcement_id, test_2fa_user_id, 'read'::public.user_min_right),
        (org_without_2fa_enforcement_id, test_no_2fa_user_id, 'read'::public.user_min_right);

    -- Store org IDs for later use
    PERFORM set_config('test.org_with_2fa_reject', org_with_2fa_enforcement_id::text, false);
    PERFORM set_config('test.org_without_2fa_reject', org_without_2fa_enforcement_id::text, false);
END $$;

-- Set up MFA factors
DO $$
DECLARE
    test_2fa_user_id uuid;
BEGIN
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_reject');

    -- Insert verified MFA factor for test_2fa_user_reject
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        test_2fa_user_id,
        'Test TOTP Reject',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        now(),
        now()
    );
END $$;

-- ============================================================================
-- Tests for reject_access_due_to_2fa function
-- ============================================================================

-- Test 1: User WITH 2FA accessing org WITH 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - user with 2FA accessing org with 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 2: User WITHOUT 2FA accessing org WITH 2FA enforcement returns true (rejection)
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_no_2fa_user_reject')
        ),
        true,
        'reject_access_due_to_2fa test - user without 2FA accessing org with 2FA enforcement returns true'
    );
SELECT tests.clear_authentication();

-- Test 3: User WITH 2FA accessing org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_without_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - user with 2FA accessing org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 4: User WITHOUT 2FA accessing org WITHOUT 2FA enforcement returns false (no rejection)
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_without_2fa_reject')::uuid,
            tests.get_supabase_uid('test_no_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - user without 2FA accessing org without 2FA enforcement returns false'
    );
SELECT tests.clear_authentication();

-- Test 5: Non-existent org returns false
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            extensions.uuid_generate_v4(),
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - non-existent org returns false'
    );
SELECT tests.clear_authentication();

-- Test 6: Regular authenticated user cannot call the function (private function)
SELECT tests.authenticate_as('test_2fa_user_reject');
SELECT
    throws_ok(
        format(
            'SELECT reject_access_due_to_2fa(''%s'', ''%s'')',
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        'permission denied for function reject_access_due_to_2fa',
        'reject_access_due_to_2fa test - regular authenticated user cannot call function'
    );
SELECT tests.clear_authentication();

-- Test 7: User without 2FA cannot call the function (private function)
SELECT tests.authenticate_as('test_no_2fa_user_reject');
SELECT
    throws_ok(
        format(
            'SELECT reject_access_due_to_2fa(''%s'', ''%s'')',
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_no_2fa_user_reject')
        ),
        'permission denied for function reject_access_due_to_2fa',
        'reject_access_due_to_2fa test - user without 2FA cannot call function'
    );
SELECT tests.clear_authentication();

-- Test 8: Anonymous user cannot call the function (private function)
SELECT tests.clear_authentication();
SELECT
    throws_ok(
        format(
            'SELECT reject_access_due_to_2fa(''%s'', ''%s'')',
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        'permission denied for function reject_access_due_to_2fa',
        'reject_access_due_to_2fa test - anonymous user cannot call function'
    );

-- Test 9: Verify function exists
SELECT
    ok(
        pg_get_functiondef(
            'reject_access_due_to_2fa(uuid, uuid)'::regprocedure
        ) IS NOT null,
        'reject_access_due_to_2fa test - function exists'
    );

-- Test 10: User WITH 2FA accessing org WITH 2FA enforcement multiple times (should always return false)
SELECT tests.authenticate_as_service_role();
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - user with 2FA accessing org with 2FA enforcement returns false (first call)'
    );
SELECT
    is(
        reject_access_due_to_2fa(
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ),
        false,
        'reject_access_due_to_2fa test - user with 2FA accessing org with 2FA enforcement returns false (second call)'
    );
SELECT tests.clear_authentication();

-- Test 11: Service role CAN call the function (has permission)
SELECT tests.authenticate_as_service_role();
SELECT
    ok(
        reject_access_due_to_2fa(
            current_setting('test.org_with_2fa_reject')::uuid,
            tests.get_supabase_uid('test_2fa_user_reject')
        ) IS NOT null,
        'reject_access_due_to_2fa test - service_role can call function'
    );
SELECT tests.clear_authentication();

SELECT *
FROM
    finish();

ROLLBACK;
