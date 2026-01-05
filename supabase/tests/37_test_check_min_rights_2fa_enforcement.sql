BEGIN;

SELECT plan(20);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_2fa_user', '2fa@test.com');
  PERFORM tests.create_supabase_user('test_no_2fa_user', 'no2fa@test.com');
  PERFORM tests.create_supabase_user('test_unverified_2fa_user', 'unverified2fa@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(tests.get_supabase_uid('test_2fa_user'), '2fa@test.com', NOW(), NOW()),
(tests.get_supabase_uid('test_no_2fa_user'), 'no2fa@test.com', NOW(), NOW()),
(
    tests.get_supabase_uid('test_unverified_2fa_user'),
    'unverified2fa@test.com',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create test orgs
DO $$
DECLARE
    org_with_2fa_enforcement_id uuid;
    org_without_2fa_enforcement_id uuid;
    test_2fa_user_id uuid;
    test_no_2fa_user_id uuid;
    test_unverified_2fa_user_id uuid;
    test_admin_id uuid;
BEGIN
    org_with_2fa_enforcement_id := gen_random_uuid();
    org_without_2fa_enforcement_id := gen_random_uuid();
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user');
    test_no_2fa_user_id := tests.get_supabase_uid('test_no_2fa_user');
    test_unverified_2fa_user_id := tests.get_supabase_uid('test_unverified_2fa_user');
    test_admin_id := tests.get_supabase_uid('test_admin');

    -- Create org WITH 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_with_2fa_enforcement_id, test_admin_id, '2FA Enforced Org', '2fa@org.com', true);

    -- Create org WITHOUT 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_without_2fa_enforcement_id, test_admin_id, 'No 2FA Org', 'no2fa@org.com', false);

    -- Add members to org WITH 2FA enforcement
    -- Give test_2fa_user admin permission (which covers read, write, and admin checks)
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_with_2fa_enforcement_id, test_2fa_user_id, 'admin'::public.user_min_right),
        (org_with_2fa_enforcement_id, test_no_2fa_user_id, 'write'::public.user_min_right),
        (org_with_2fa_enforcement_id, test_unverified_2fa_user_id, 'admin'::public.user_min_right);

    -- Add members to org WITHOUT 2FA enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (org_without_2fa_enforcement_id, test_2fa_user_id, 'read'::public.user_min_right),
        (org_without_2fa_enforcement_id, test_no_2fa_user_id, 'write'::public.user_min_right),
        (org_without_2fa_enforcement_id, test_unverified_2fa_user_id, 'admin'::public.user_min_right);

    -- Store org IDs for later use
    PERFORM set_config('test.org_with_2fa', org_with_2fa_enforcement_id::text, false);
    PERFORM set_config('test.org_without_2fa', org_without_2fa_enforcement_id::text, false);
END $$;

-- Set up MFA factors
DO $$
DECLARE
    test_2fa_user_id uuid;
    test_unverified_2fa_user_id uuid;
BEGIN
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user');
    test_unverified_2fa_user_id := tests.get_supabase_uid('test_unverified_2fa_user');

    -- Insert verified MFA factor for test_2fa_user
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        test_2fa_user_id,
        'Test TOTP',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        NOW(),
        NOW()
    );

    -- Insert unverified MFA factor for test_unverified_2fa_user
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        test_unverified_2fa_user_id,
        'Test TOTP Unverified',
        'totp'::auth.factor_type,
        'unverified'::auth.factor_status,
        NOW(),
        NOW()
    );
END $$;

-- ============================================================================
-- Tests for org WITHOUT 2FA enforcement (should work normally)
-- ============================================================================

-- Test 1: User with 2FA can access org without 2FA enforcement
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_without_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with 2FA can access org without enforcement'
    );

-- Test 2: User without 2FA can access org without 2FA enforcement
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_without_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user without 2FA can access org without enforcement'
    );

-- Test 3: User with unverified 2FA can access org without 2FA enforcement
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_unverified_2fa_user'),
            current_setting('test.org_without_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with unverified 2FA can access org without enforcement'
    );

-- ============================================================================
-- Tests for org WITH 2FA enforcement
-- ============================================================================

-- Test 4: User with verified 2FA can access org with 2FA enforcement
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with verified 2FA can access org with enforcement'
    );

-- Test 5: User without 2FA CANNOT access org with 2FA enforcement
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user without 2FA cannot access org with enforcement'
    );

-- Test 6: User with unverified 2FA CANNOT access org with 2FA enforcement
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_unverified_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user with unverified 2FA cannot access org with enforcement'
    );

-- ============================================================================
-- Tests for different permission levels with 2FA enforcement
-- ============================================================================

-- Test 7: User with 2FA can access with read permission
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with 2FA can access with read permission'
    );

-- Test 8: User with 2FA can access with write permission
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with 2FA can access with write permission'
    );

-- Test 9: User with 2FA can access with admin permission
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with 2FA can access with admin permission'
    );

-- Test 10: User without 2FA cannot access with any permission level
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user without 2FA cannot access with read permission'
    );

-- Test 11: User without 2FA cannot access with write permission
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user without 2FA cannot access with write permission'
    );

-- Test 12: User without 2FA cannot access with admin permission
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user without 2FA cannot access with admin permission'
    );

-- ============================================================================
-- Tests for app_id and channel_id scoped permissions
-- ============================================================================

-- Create a test app for scoped permission tests
DO $$
DECLARE
    test_app_id varchar := 'com.test.2fa.app';
    org_with_2fa_id uuid;
    test_2fa_user_id uuid;
BEGIN
    org_with_2fa_id := current_setting('test.org_with_2fa')::uuid;
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user');

    -- Create app
    INSERT INTO public.apps (app_id, name, owner_org, user_id, icon_url, created_at, updated_at)
    VALUES (test_app_id, 'Test 2FA App', org_with_2fa_id, test_2fa_user_id, '', NOW(), NOW())
    ON CONFLICT (app_id) DO NOTHING;

    -- Add app-specific permission
    INSERT INTO public.org_users (org_id, user_id, user_right, app_id)
    VALUES (org_with_2fa_id, test_2fa_user_id, 'write'::public.user_min_right, test_app_id)
    ON CONFLICT DO NOTHING;

    PERFORM set_config('test.app_id', test_app_id, false);
END $$;

-- Test 13: User with 2FA can access app-scoped permission
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            current_setting('test.app_id')::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights 2FA enforcement test - user with 2FA can access app-scoped permission'
    );

-- Test 14: User without 2FA cannot access app-scoped permission
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            current_setting('test.app_id')::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user without 2FA cannot access app-scoped permission'
    );

-- ============================================================================
-- Edge cases
-- ============================================================================

-- Test 15: NULL user_id returns false (existing behavior)
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            NULL::uuid,
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - NULL user_id returns false'
    );

-- Test 16: Non-existent org returns false (no org found, so no rights)
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            gen_random_uuid(),
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - non-existent org returns false'
    );

-- Test 17: User not in org returns false (even with 2FA)
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - user not in org returns false'
    );

-- ============================================================================
-- Test that 2FA check happens before permission check
-- ============================================================================

-- Test 18: User without 2FA is denied even if they would have had permission
-- (test_no_2fa_user has write permission in org_with_2fa, but should be denied due to 2FA)
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_no_2fa_user'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - 2FA check happens before permission check'
    );

-- ============================================================================
-- Test super_admin access (should still be subject to 2FA enforcement)
-- ============================================================================

-- Test 19: Super admin without 2FA cannot access org with 2FA enforcement
-- Note: test_admin is super_admin of org_with_2fa (created_by), but doesn't have 2FA
SELECT
    is(
        check_min_rights(
            'super_admin'::public.user_min_right,
            tests.get_supabase_uid('test_admin'),
            current_setting('test.org_with_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - super_admin without 2FA cannot access org with enforcement'
    );

-- ============================================================================
-- Verify function still works correctly for normal cases
-- ============================================================================

-- Test 20: Normal permission check still works (user with insufficient rights)
SELECT
    is(
        check_min_rights(
            'super_admin'::public.user_min_right,
            tests.get_supabase_uid('test_2fa_user'),
            current_setting('test.org_without_2fa')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights 2FA enforcement test - normal permission check still works'
    );

SELECT *
FROM
    finish();

ROLLBACK;
