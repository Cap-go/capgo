BEGIN;

SELECT plan(30);

-- Create test users for password policy tests
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_pwd_compliant_v8', 'pwd_compliant_v8@test.com');
  PERFORM tests.create_supabase_user('test_pwd_noncompliant_v8', 'pwd_noncompliant_v8@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
    (tests.get_supabase_uid('test_pwd_compliant_v8'), 'pwd_compliant_v8@test.com', now(), now()),
    (tests.get_supabase_uid('test_pwd_noncompliant_v8'), 'pwd_noncompliant_v8@test.com', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Update auth.users updated_at for testing password policy compliance
DO $$
DECLARE
    compliant_user_id uuid;
    noncompliant_user_id uuid;
BEGIN
    compliant_user_id := tests.get_supabase_uid('test_pwd_compliant_v8');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_v8');

    -- Set compliant user's updated_at to a very recent time (after policy)
    UPDATE auth.users SET updated_at = now() + interval '1 hour' WHERE id = compliant_user_id;

    -- Set non-compliant user's updated_at to an older time (before policy)
    UPDATE auth.users SET updated_at = now() - interval '1 year' WHERE id = noncompliant_user_id;
END $$;

-- Create test orgs
DO $$
DECLARE
    org_with_pwd_policy_id uuid;
    org_without_pwd_policy_id uuid;
    org_with_both_policies_id uuid;
    compliant_user_id uuid;
    noncompliant_user_id uuid;
    test_admin_id uuid;
BEGIN
    org_with_pwd_policy_id := extensions.uuid_generate_v4();
    org_without_pwd_policy_id := extensions.uuid_generate_v4();
    org_with_both_policies_id := extensions.uuid_generate_v4();
    compliant_user_id := tests.get_supabase_uid('test_pwd_compliant_v8');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_v8');
    test_admin_id := tests.get_supabase_uid('test_admin');

    -- Create org WITH password policy enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config, password_policy_updated_at)
    VALUES (
        org_with_pwd_policy_id,
        test_admin_id,
        'Pwd Policy Org V8',
        'pwd_v8@org.com',
        '{"enabled": true, "min_length": 10, "require_uppercase": true, "require_number": true, "require_special": true}'::jsonb,
        now()
    );

    -- Create org WITHOUT password policy enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config, password_policy_updated_at)
    VALUES (
        org_without_pwd_policy_id,
        test_admin_id,
        'No Pwd Policy Org V8',
        'nopwd_v8@org.com',
        NULL,
        NULL
    );

    -- Create org WITH both 2FA and password policy enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa, password_policy_config, password_policy_updated_at)
    VALUES (
        org_with_both_policies_id,
        test_admin_id,
        'Both Policies Org V8',
        'both_v8@org.com',
        true,
        '{"enabled": true, "min_length": 12, "require_uppercase": true, "require_number": true, "require_special": true}'::jsonb,
        now()
    );

    -- Add members to org WITH password policy enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_with_pwd_policy_id, compliant_user_id, 'admin'::public.user_min_right),
        (org_with_pwd_policy_id, noncompliant_user_id, 'read'::public.user_min_right);

    -- Add members to org WITHOUT password policy enforcement
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_without_pwd_policy_id, compliant_user_id, 'read'::public.user_min_right),
        (org_without_pwd_policy_id, noncompliant_user_id, 'read'::public.user_min_right);

    -- Add members to org WITH both policies
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES
        (org_with_both_policies_id, compliant_user_id, 'admin'::public.user_min_right),
        (org_with_both_policies_id, noncompliant_user_id, 'read'::public.user_min_right);

    -- Store org IDs for later use
    PERFORM set_config('test.org_with_pwd_policy_v8', org_with_pwd_policy_id::text, false);
    PERFORM set_config('test.org_without_pwd_policy_v8', org_without_pwd_policy_id::text, false);
    PERFORM set_config('test.org_with_both_policies_v8', org_with_both_policies_id::text, false);
END $$;

-- ============================================================================
-- Tests for get_orgs_v8 password_has_access field
-- ============================================================================

-- Test 1: Compliant user has password_has_access = true in org WITH password policy
SELECT
    is(
        (
            SELECT password_has_access
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - compliant user has password_has_access = true in org with password policy'
    );

-- Test 2: Non-compliant user has password_has_access = false in org WITH password policy
SELECT
    is(
        (
            SELECT password_has_access
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - non-compliant user has password_has_access = false in org with password policy'
    );

-- Test 3: Any user has password_has_access = true in org WITHOUT password policy
SELECT
    is(
        (
            SELECT password_has_access
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_without_pwd_policy_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - any user has password_has_access = true in org without password policy'
    );

-- ============================================================================
-- Tests for get_orgs_v8 password_policy_config field
-- ============================================================================

-- Test 4: Compliant user can see password_policy_config
SELECT
    is(
        (
            SELECT (password_policy_config->>'enabled')::boolean
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - compliant user can see password_policy_config enabled field'
    );

-- Test 5: Compliant user can see password_policy_config min_length
SELECT
    is(
        (
            SELECT (password_policy_config->>'min_length')::int
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        10,
        'get_orgs_v8 test - compliant user can see password_policy_config min_length'
    );

-- Test 6: Non-compliant user can also see password_policy_config (needed to display requirements)
SELECT
    is(
        (
            SELECT (password_policy_config->>'enabled')::boolean
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - non-compliant user can also see password_policy_config (needed to display requirements)'
    );

-- Test 7: Org without policy has NULL password_policy_config
SELECT
    is(
        (
            SELECT password_policy_config
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_without_pwd_policy_v8')::uuid
        ),
        NULL::jsonb,
        'get_orgs_v8 test - org without policy has NULL password_policy_config'
    );

-- ============================================================================
-- Tests for sensitive data redaction based on password_has_access
-- ============================================================================

-- Test 8: Non-compliant user sees redacted paying field (should be false)
SELECT
    is(
        (
            SELECT paying
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - non-compliant user sees redacted paying field'
    );

-- Test 9: Non-compliant user sees redacted trial_left field (should be 0)
SELECT
    is(
        (
            SELECT trial_left
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        0,
        'get_orgs_v8 test - non-compliant user sees redacted trial_left field'
    );

-- Test 10: Non-compliant user sees redacted can_use_more field (should be false)
SELECT
    is(
        (
            SELECT can_use_more
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - non-compliant user sees redacted can_use_more field'
    );

-- Test 11: Non-compliant user sees redacted is_canceled field (should be false)
SELECT
    is(
        (
            SELECT is_canceled
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - non-compliant user sees redacted is_canceled field'
    );

-- Test 12: Non-compliant user sees redacted app_count field (should be 0)
SELECT
    is(
        (
            SELECT app_count
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        0::bigint,
        'get_orgs_v8 test - non-compliant user sees redacted app_count field'
    );

-- Test 13: Non-compliant user sees redacted subscription_start field (should be NULL)
SELECT
    is(
        (
            SELECT subscription_start
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        NULL::timestamptz,
        'get_orgs_v8 test - non-compliant user sees redacted subscription_start field'
    );

-- Test 14: Non-compliant user sees redacted subscription_end field (should be NULL)
SELECT
    is(
        (
            SELECT subscription_end
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        NULL::timestamptz,
        'get_orgs_v8 test - non-compliant user sees redacted subscription_end field'
    );

-- Test 15: Non-compliant user sees redacted management_email field (should be NULL)
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        NULL::text,
        'get_orgs_v8 test - non-compliant user sees redacted management_email field'
    );

-- Test 16: Non-compliant user sees redacted is_yearly field (should be false)
SELECT
    is(
        (
            SELECT is_yearly
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - non-compliant user sees redacted is_yearly field'
    );

-- Test 17: Compliant user sees real management_email value
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        'pwd_v8@org.com',
        'get_orgs_v8 test - compliant user sees real management_email value'
    );

-- Test 18: Compliant user sees real org name
SELECT
    is(
        (
            SELECT name
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        'Pwd Policy Org V8',
        'get_orgs_v8 test - compliant user sees real org name'
    );

-- Test 19: Non-compliant user also sees org name (not sensitive)
SELECT
    is(
        (
            SELECT name
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        'Pwd Policy Org V8',
        'get_orgs_v8 test - non-compliant user also sees org name (not sensitive)'
    );

-- ============================================================================
-- Tests for combined 2FA and password policy enforcement
-- ============================================================================

-- Test 20: In org with both policies, user needs both 2FA and compliant password
-- Compliant password user without 2FA should have password_has_access=true but 2fa_has_access=false
SELECT
    is(
        (
            SELECT password_has_access
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_both_policies_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - compliant password user has password_has_access=true in org with both policies'
    );

-- Test 21: Compliant password user without 2FA should have 2fa_has_access=false
SELECT
    is(
        (
            SELECT "2fa_has_access"
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_with_both_policies_v8')::uuid
        ),
        false,
        'get_orgs_v8 test - compliant password user without 2FA has 2fa_has_access=false in org with both policies'
    );

-- Test 22: Non-compliant user should have both access flags as false in org with both policies
SELECT
    ok(
        (
            SELECT
                password_has_access = false
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_both_policies_v8')::uuid
        ),
        'get_orgs_v8 test - non-compliant user has password_has_access=false in org with both policies'
    );

-- ============================================================================
-- Tests for get_orgs_v6 and get_orgs_v7 also enforcing password policy redaction
-- ============================================================================

-- Test 23: get_orgs_v6 redacts data for non-compliant password user
SELECT
    is(
        (
            SELECT paying
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v6 test - non-compliant password user sees redacted paying field'
    );

-- Test 24: get_orgs_v6 redacts management_email for non-compliant password user
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        NULL::text,
        'get_orgs_v6 test - non-compliant password user sees redacted management_email field'
    );

-- Test 25: get_orgs_v7 redacts data for non-compliant password user
SELECT
    is(
        (
            SELECT paying
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        false,
        'get_orgs_v7 test - non-compliant password user sees redacted paying field'
    );

-- Test 26: get_orgs_v7 redacts management_email for non-compliant password user
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        NULL::text,
        'get_orgs_v7 test - non-compliant password user sees redacted management_email field'
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
    org_disabled_policy_id := extensions.uuid_generate_v4();
    test_admin_id := tests.get_supabase_uid('test_admin');
    noncompliant_user_id := tests.get_supabase_uid('test_pwd_noncompliant_v8');

    INSERT INTO public.orgs (id, created_by, name, management_email, password_policy_config, password_policy_updated_at)
    VALUES (
        org_disabled_policy_id,
        test_admin_id,
        'Disabled Policy Org V8',
        'disabled_v8@org.com',
        '{"enabled": false, "min_length": 10}'::jsonb,
        now()
    );

    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES (org_disabled_policy_id, noncompliant_user_id, 'admin'::public.user_min_right);

    PERFORM set_config('test.org_disabled_policy_v8', org_disabled_policy_id::text, false);
END $$;

-- Test 27: Non-compliant user has password_has_access = true in org with DISABLED policy
SELECT
    is(
        (
            SELECT password_has_access
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_disabled_policy_v8')::uuid
        ),
        true,
        'get_orgs_v8 test - non-compliant user has password_has_access = true in org with disabled policy'
    );

-- Test 28: Non-compliant user sees real management_email in org with disabled policy
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_disabled_policy_v8')::uuid
        ),
        'disabled_v8@org.com',
        'get_orgs_v8 test - non-compliant user sees real management_email in org with disabled policy'
    );

-- ============================================================================
-- Verify all fields are redacted simultaneously
-- ============================================================================

-- Test 29: Non-compliant user sees all sensitive fields redacted simultaneously
SELECT
    ok(
        (
            SELECT
                paying = false
                AND trial_left = 0
                AND can_use_more = false
                AND is_canceled = false
                AND app_count = 0
                AND subscription_start IS NULL
                AND subscription_end IS NULL
                AND management_email IS NULL
                AND is_yearly = false
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_noncompliant_v8'))
            WHERE gid = current_setting('test.org_with_pwd_policy_v8')::uuid
        ),
        'get_orgs_v8 test - non-compliant user sees all sensitive fields redacted simultaneously'
    );

-- Test 30: Compliant user in org without policy can see real data
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v8(tests.get_supabase_uid('test_pwd_compliant_v8'))
            WHERE gid = current_setting('test.org_without_pwd_policy_v8')::uuid
        ),
        'nopwd_v8@org.com',
        'get_orgs_v8 test - compliant user in org without policy can see real management_email'
    );

SELECT *
FROM
    finish();

ROLLBACK;
