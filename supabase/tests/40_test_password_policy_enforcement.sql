BEGIN;

SELECT plan(18);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_pwd_compliant_user', 'compliant@test.com');
  PERFORM tests.create_supabase_user('test_pwd_noncompliant_user', 'noncompliant@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
    tests.get_supabase_uid('test_pwd_compliant_user'),
    'compliant@test.com',
    now(),
    now()
),
(
    tests.get_supabase_uid('test_pwd_noncompliant_user'),
    'noncompliant@test.com',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Create test orgs and add compliance records for compliant users
DO $$
DECLARE
    org_with_pwd_policy_id uuid;
    org_without_pwd_policy_id uuid;
    compliant_user_id uuid;
    noncompliant_user_id uuid;
    test_admin_id uuid;
    policy_config jsonb;
    policy_hash text;
BEGIN
    org_with_pwd_policy_id := gen_random_uuid();
    org_without_pwd_policy_id := gen_random_uuid();
    compliant_user_id := tests.get_supabase_uid('test_pwd_compliant_user');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_user');
    test_admin_id := tests.get_supabase_uid('test_admin');

    -- Define password policy config
    policy_config := '{"enabled": true, "min_length": 10, "require_uppercase": true, "require_number": true, "require_special": true}'::jsonb;

    -- Create org WITH password policy enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config)
    VALUES (
        org_with_pwd_policy_id,
        test_admin_id,
        'Pwd Policy Org',
        'pwd@org.com',
        policy_config
    );

    -- Create org WITHOUT password policy enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config)
    VALUES (
        org_without_pwd_policy_id,
        test_admin_id,
        'No Pwd Policy Org',
        'nopwd@org.com',
        NULL
    );

    -- Add members to org WITH password policy
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_with_pwd_policy_id, compliant_user_id, 'admin'::public.user_min_right),
        (org_with_pwd_policy_id, noncompliant_user_id, 'write'::public.user_min_right);

    -- Add members to org WITHOUT password policy
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_without_pwd_policy_id, compliant_user_id, 'read'::public.user_min_right),
        (org_without_pwd_policy_id, noncompliant_user_id, 'write'::public.user_min_right);

    -- Add compliance record for the compliant user (password verified)
    -- This simulates a user who has successfully validated their password via the backend
    policy_hash := public.get_password_policy_hash(policy_config);
    INSERT INTO public.user_password_compliance (user_id, org_id, policy_hash, validated_at)
    VALUES (compliant_user_id, org_with_pwd_policy_id, policy_hash, NOW());

    -- Store org IDs for later use
    PERFORM set_config('test.org_with_pwd_policy', org_with_pwd_policy_id::text, false);
    PERFORM set_config('test.org_without_pwd_policy', org_without_pwd_policy_id::text, false);
END $$;

-- ============================================================================
-- Tests for user_meets_password_policy function
-- ============================================================================

-- Test 1: Compliant user meets password policy in org with policy
SELECT
    is(
        user_meets_password_policy(
            tests.get_supabase_uid('test_pwd_compliant_user'),
            current_setting('test.org_with_pwd_policy')::uuid
        ),
        TRUE,
        'user_meets_password_policy - compliant user meets policy'
    );

-- Test 2: Non-compliant user does NOT meet password policy in org with policy
SELECT
    is(
        user_meets_password_policy(
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_with_pwd_policy')::uuid
        ),
        FALSE,
        'user_meets_password_policy - non-compliant user does not meet policy'
    );

-- Test 3: Any user meets policy in org WITHOUT policy
SELECT
    is(
        user_meets_password_policy(
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_without_pwd_policy')::uuid
        ),
        TRUE,
        'user_meets_password_policy - any user meets policy when no policy is set'
    );

-- ============================================================================
-- Tests for org WITHOUT password policy (should work normally)
-- ============================================================================

-- Test 4: Compliant user can access org without password policy
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_compliant_user'),
            current_setting('test.org_without_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights password policy - compliant user can access org without policy'
    );

-- Test 5: Non-compliant user can access org without password policy
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_without_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights password policy - non-compliant user can access org without policy'
    );

-- ============================================================================
-- Tests for org WITH password policy enforcement
-- ============================================================================

-- Test 6: Compliant user can access org with password policy
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_compliant_user'),
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights password policy - compliant user can access org with policy'
    );

-- Test 7: Non-compliant user CANNOT access org with password policy
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights password policy - non-compliant user cannot access org with policy'
    );

-- Test 8: Non-compliant user cannot access with any permission level
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights password policy - non-compliant user cannot access with read'
    );

-- ============================================================================
-- Tests for reject_access_due_to_password_policy function
-- ============================================================================

-- Test 9: Org with policy - non-compliant user should be rejected
SELECT
    is(
        reject_access_due_to_password_policy(
            current_setting('test.org_with_pwd_policy')::uuid,
            tests.get_supabase_uid('test_pwd_noncompliant_user')
        ),
        TRUE,
        'reject_access_due_to_password_policy - non-compliant user rejected'
    );

-- Test 10: Org with policy - compliant user should NOT be rejected
SELECT
    is(
        reject_access_due_to_password_policy(
            current_setting('test.org_with_pwd_policy')::uuid,
            tests.get_supabase_uid('test_pwd_compliant_user')
        ),
        FALSE,
        'reject_access_due_to_password_policy - compliant user not rejected'
    );

-- Test 11: Org without policy - any user should NOT be rejected
SELECT
    is(
        reject_access_due_to_password_policy(
            current_setting('test.org_without_pwd_policy')::uuid,
            tests.get_supabase_uid('test_pwd_noncompliant_user')
        ),
        FALSE,
        'reject_access_due_to_password_policy - user not rejected when no policy'
    );

-- Test 12: Non-existent org should NOT reject
SELECT
    is(
        reject_access_due_to_password_policy(
            gen_random_uuid(),
            tests.get_supabase_uid('test_pwd_noncompliant_user')
        ),
        FALSE,
        'reject_access_due_to_password_policy - non-existent org does not reject'
    );

-- ============================================================================
-- Tests for disabled password policy
-- ============================================================================

-- Create org with disabled password policy
DO $$
DECLARE
    org_disabled_policy_id uuid;
    test_admin_id uuid;
    noncompliant_user_id uuid;
BEGIN
    org_disabled_policy_id := gen_random_uuid();
    test_admin_id := tests.get_supabase_uid('test_admin');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_user');

    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config)
    VALUES (
        org_disabled_policy_id,
        test_admin_id,
        'Disabled Policy Org',
        'disabled@org.com',
        '{"enabled": false, "min_length": 10}'::jsonb
    );

    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES (org_disabled_policy_id, noncompliant_user_id, 'write'::public.user_min_right);

    PERFORM set_config('test.org_disabled_policy', org_disabled_policy_id::text, false);
END $$;

-- Test 13: Non-compliant user can access org with disabled policy
SELECT
    is(
        check_min_rights(
            'write'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_disabled_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights password policy - non-compliant user can access org with disabled policy'
    );

-- Test 14: user_meets_password_policy returns true for disabled policy
SELECT
    is(
        user_meets_password_policy(
            tests.get_supabase_uid('test_pwd_noncompliant_user'),
            current_setting('test.org_disabled_policy')::uuid
        ),
        TRUE,
        'user_meets_password_policy - disabled policy returns true'
    );

-- ============================================================================
-- Edge cases
-- ============================================================================

-- Test 15: NULL user_id returns false
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            NULL::uuid,
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights password policy - NULL user_id returns false'
    );

-- Test 16: User not in org returns false (even if compliant)
SELECT
    is(
        check_min_rights(
            'read'::public.user_min_right,
            tests.get_supabase_uid('test_user'),
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights password policy - user not in org returns false'
    );

-- ============================================================================
-- Test super_admin access (should still be subject to password policy)
-- ============================================================================

-- Add test_admin to org but without compliance record
DO $$
DECLARE
    test_admin_id uuid;
    target_org_id uuid;
BEGIN
    test_admin_id := tests.get_supabase_uid('test_admin');
    target_org_id := current_setting('test.org_with_pwd_policy')::uuid;

    -- Add test_admin to org as super_admin (but no compliance record)
    -- Only insert if not already exists
    IF NOT EXISTS (
        SELECT 1 FROM public.org_users
        WHERE org_id = target_org_id AND user_id = test_admin_id
    ) THEN
        INSERT INTO public.org_users (org_id, user_id, user_right)
        VALUES (target_org_id, test_admin_id, 'super_admin'::public.user_min_right);
    END IF;
END $$;

-- Test 17: Super admin without compliance record cannot access org with policy
SELECT
    is(
        check_min_rights(
            'super_admin'::public.user_min_right,
            tests.get_supabase_uid('test_admin'),
            current_setting('test.org_with_pwd_policy')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights password policy - super_admin without compliance record cannot access'
    );

-- ============================================================================
-- Test both 2FA and password policy together
-- ============================================================================

-- Create org with both 2FA and password policy
DO $$
DECLARE
    org_both_policies_id uuid;
    test_admin_id uuid;
    compliant_user_id uuid;
    noncompliant_user_id uuid;
    policy_config jsonb;
    policy_hash text;
BEGIN
    org_both_policies_id := gen_random_uuid();
    test_admin_id := tests.get_supabase_uid('test_admin');
    compliant_user_id := tests.get_supabase_uid('test_pwd_compliant_user');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_user');
    policy_config := '{"enabled": true, "min_length": 10, "require_uppercase": true}'::jsonb;

    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa, password_policy_config)
    VALUES (
        org_both_policies_id,
        test_admin_id,
        'Both Policies Org',
        'both@org.com',
        true,
        policy_config
    );

    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_both_policies_id, compliant_user_id, 'admin'::public.user_min_right),
        (org_both_policies_id, noncompliant_user_id, 'write'::public.user_min_right);

    -- Add password compliance record for compliant user
    policy_hash := public.get_password_policy_hash(policy_config);
    INSERT INTO public.user_password_compliance (user_id, org_id, policy_hash, validated_at)
    VALUES (compliant_user_id, org_both_policies_id, policy_hash, NOW());

    PERFORM set_config('test.org_both_policies', org_both_policies_id::text, false);
END $$;

-- Test 18: User with compliant password but without 2FA can't access org with both policies
-- (because 2FA is still required)
SELECT
    is(
        check_min_rights(
            'admin'::public.user_min_right,
            tests.get_supabase_uid('test_pwd_compliant_user'),
            current_setting('test.org_both_policies')::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights both policies - user without 2FA denied even with compliant password'
    );

SELECT *
FROM
    finish();

ROLLBACK;
