BEGIN;

SELECT plan(26);

-- Create test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_2fa_user_v7', '2fa_v7@test.com');
  PERFORM tests.create_supabase_user('test_no_2fa_user_v7', 'no2fa_v7@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
    (tests.get_supabase_uid('test_2fa_user_v7'), '2fa_v7@test.com', NOW(), NOW()),
    (tests.get_supabase_uid('test_no_2fa_user_v7'), 'no2fa_v7@test.com', NOW(), NOW())
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
    org_with_2fa_enforcement_id := gen_random_uuid();
    org_without_2fa_enforcement_id := gen_random_uuid();
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_v7');
    test_no_2fa_user_id := tests.get_supabase_uid('test_no_2fa_user_v7');
    test_admin_id := tests.get_supabase_uid('test_admin');

    -- Create org WITH 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_with_2fa_enforcement_id, test_admin_id, '2FA Enforced Org V7', '2fa_v7@org.com', true);

    -- Create org WITHOUT 2FA enforcement
    INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
    VALUES (org_without_2fa_enforcement_id, test_admin_id, 'No 2FA Org V7', 'no2fa_v7@org.com', false);

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
    PERFORM set_config('test.org_with_2fa_v7', org_with_2fa_enforcement_id::text, false);
    PERFORM set_config('test.org_without_2fa_v7', org_without_2fa_enforcement_id::text, false);
END $$;

-- Set up MFA factors
DO $$
DECLARE
    test_2fa_user_id uuid;
BEGIN
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_v7');

    -- Insert verified MFA factor for test_2fa_user_v7
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        test_2fa_user_id,
        'Test TOTP V7',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        NOW(),
        NOW()
    );
END $$;

-- ============================================================================
-- Tests for get_orgs_v7(userid uuid)
-- ============================================================================

-- Test 1: User with 2FA can see org WITH 2FA enforcement and has access
SELECT
    is(
        (
            SELECT "2fa_has_access"
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        true,
        'get_orgs_v7 test - user with 2FA has access to org with 2FA enforcement'
    );

-- Test 2: User with 2FA can see enforcing_2fa field
SELECT
    is(
        (
            SELECT enforcing_2fa
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        true,
        'get_orgs_v7 test - user with 2FA can see enforcing_2fa field'
    );

-- Test 3: User without 2FA DOES see org WITH 2FA enforcement but with 2fa_has_access = false
SELECT
    is(
        (
            SELECT COUNT(*)
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        1::bigint,
        'get_orgs_v7 test - user without 2FA DOES see org with 2FA enforcement (with redacted fields)'
    );

-- Test 4: User without 2FA DOES see enforcing_2fa field (org is visible but redacted)
SELECT
    is(
        (
            SELECT enforcing_2fa
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        true,
        'get_orgs_v7 test - user without 2FA DOES see enforcing_2fa field set to true'
    );

-- ============================================================================
-- Tests to verify redaction is actually working by comparing values
-- ============================================================================

-- Test 19: User WITH 2FA sees real paying value (not redacted)
-- First, let's set up an org with actual stripe_info to test real values
DO $$
DECLARE
    test_org_id uuid;
    test_admin_id uuid;
    test_2fa_user_id uuid;
BEGIN
    test_org_id := current_setting('test.org_with_2fa_v7')::uuid;
    test_admin_id := tests.get_supabase_uid('test_admin');
    test_2fa_user_id := tests.get_supabase_uid('test_2fa_user_v7');

    -- Create stripe_info for the org to have real values
    INSERT INTO public.stripe_info (
        customer_id, 
        status, 
        product_id, 
        price_id, 
        subscription_anchor_start,
        subscription_anchor_end,
        is_good_plan,
        created_at,
        updated_at
    )
    SELECT 
        o.customer_id,
        'succeeded',
        p.stripe_id,
        p.price_m_id, -- monthly price
        NOW() - INTERVAL '10 days',
        NOW() + INTERVAL '20 days',
        true,
        NOW(),
        NOW()
    FROM public.orgs o
    CROSS JOIN public.plans p
    WHERE o.id = test_org_id
    AND p.name = 'Free'
    LIMIT 1
    ON CONFLICT (customer_id) DO UPDATE SET
        status = 'succeeded',
        subscription_anchor_end = NOW() + INTERVAL '20 days',
        is_good_plan = true;
END $$;

-- ============================================================================
-- Tests to verify redaction is actually working by comparing values
-- ============================================================================

-- Test 19: User WITH 2FA sees real management_email (we know it's '2fa_v7@org.com' from INSERT)
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        '2fa_v7@org.com',
        'get_orgs_v7 test - user with 2FA sees real management_email value'
    );

-- Test 20: User WITHOUT 2FA sees redacted management_email (should be NULL) and has 2fa_has_access = false
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        NULL::text,
        'get_orgs_v7 test - user without 2FA sees redacted management_email field (NULL)'
    );

-- Test 20b: User WITHOUT 2FA has 2fa_has_access = false
SELECT
    is(
        (
            SELECT "2fa_has_access"
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v7 test - user without 2FA has 2fa_has_access = false'
    );

-- Test 21: Verify redaction difference - management_email differs between users (now org is visible)
SELECT
    ok(
        (
            SELECT 
                (SELECT management_email FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7')) WHERE gid = current_setting('test.org_with_2fa_v7')::uuid)
                IS DISTINCT FROM
                (SELECT management_email FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7')) WHERE gid = current_setting('test.org_with_2fa_v7')::uuid)
        ),
        'get_orgs_v7 test - management_email field differs between user with 2FA and without 2FA (redaction working)'
    );

-- Test 22: User WITH 2FA sees real name field (not redacted)
SELECT
    is(
        (
            SELECT name
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        '2FA Enforced Org V7',
        'get_orgs_v7 test - user with 2FA sees real name value'
    );

-- Test 23: User WITHOUT 2FA DOES see the org name (org is visible with redacted sensitive fields)
SELECT
    is(
        (
            SELECT name
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        '2FA Enforced Org V7',
        'get_orgs_v7 test - user without 2FA DOES see org name (org is visible, sensitive fields redacted)'
    );

-- Test 24: User WITHOUT 2FA DOES see the org gid (org is visible)
SELECT
    ok(
        (
            SELECT
                (SELECT gid FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7')) WHERE gid = current_setting('test.org_with_2fa_v7')::uuid) IS NOT NULL
        ),
        'get_orgs_v7 test - user without 2FA DOES see org gid (org is visible)'
    );

-- Test 5: User with 2FA has access to org WITHOUT 2FA enforcement
SELECT
    is(
        (
            SELECT "2fa_has_access"
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_2fa_user_v7'))
            WHERE gid = current_setting('test.org_without_2fa_v7')::uuid
        ),
        true,
        'get_orgs_v7 test - user with 2FA has access to org without 2FA enforcement'
    );

-- Test 6: User without 2FA has access to org WITHOUT 2FA enforcement
SELECT
    is(
        (
            SELECT "2fa_has_access"
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_without_2fa_v7')::uuid
        ),
        true,
        'get_orgs_v7 test - user without 2FA has access to org without 2FA enforcement'
    );

-- ============================================================================
-- Tests for sensitive data redaction in get_orgs_v7
-- ============================================================================

-- Test 7: User without 2FA sees redacted paying field (false, not NULL)
SELECT
    is(
        (
            SELECT paying
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v7 test - user without 2FA sees redacted paying field (false)'
    );

-- Test 8: User without 2FA sees redacted trial_left field (0, not NULL)
SELECT
    is(
        (
            SELECT trial_left
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        0,
        'get_orgs_v7 test - user without 2FA sees redacted trial_left field (0)'
    );

-- Test 9: User without 2FA sees redacted can_use_more field (false, not NULL)
SELECT
    is(
        (
            SELECT can_use_more
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v7 test - user without 2FA sees redacted can_use_more field (false)'
    );

-- Test 10: User without 2FA sees redacted is_canceled field (false, not NULL)
SELECT
    is(
        (
            SELECT is_canceled
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v7 test - user without 2FA sees redacted is_canceled field (false)'
    );

-- Test 11: User without 2FA sees redacted app_count field (0, not NULL)
SELECT
    is(
        (
            SELECT app_count
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        0::bigint,
        'get_orgs_v7 test - user without 2FA sees redacted app_count field (0)'
    );

-- Test 12: User without 2FA sees redacted subscription_start field (should be NULL)
SELECT
    is(
        (
            SELECT subscription_start
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        NULL::timestamptz,
        'get_orgs_v7 test - user without 2FA sees redacted subscription_start field'
    );

-- Test 13: User without 2FA sees redacted subscription_end field (should be NULL)
SELECT
    is(
        (
            SELECT subscription_end
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        NULL::timestamptz,
        'get_orgs_v7 test - user without 2FA sees redacted subscription_end field'
    );

-- Test 14: User without 2FA sees redacted management_email field (NULL)
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        NULL::text,
        'get_orgs_v7 test - user without 2FA sees redacted management_email field (NULL)'
    );

-- Test 15: User without 2FA sees redacted is_yearly field (false, not NULL)
SELECT
    is(
        (
            SELECT is_yearly
            FROM public.get_orgs_v7(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v7 test - user without 2FA sees redacted is_yearly field (false)'
    );

-- ============================================================================
-- Tests for get_orgs_v6 redaction (should behave the same)
-- ============================================================================

-- Test 16: get_orgs_v6 also redacts sensitive data for user without 2FA
SELECT
    is(
        (
            SELECT paying
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        false,
        'get_orgs_v6 test - user without 2FA sees redacted paying field'
    );

-- Test 17: get_orgs_v6 redacts management_email for user without 2FA
SELECT
    is(
        (
            SELECT management_email
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        NULL::text,
        'get_orgs_v6 test - user without 2FA sees redacted management_email field'
    );

-- Test 18: get_orgs_v6 redacts app_count for user without 2FA
SELECT
    is(
        (
            SELECT app_count
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        0::bigint,
        'get_orgs_v6 test - user without 2FA sees redacted app_count field'
    );

-- Test 26: User WITHOUT 2FA sees all sensitive fields redacted simultaneously in get_orgs_v6
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
            FROM public.get_orgs_v6(tests.get_supabase_uid('test_no_2fa_user_v7'))
            WHERE gid = current_setting('test.org_with_2fa_v7')::uuid
        ),
        'get_orgs_v6 test - user without 2FA sees all sensitive fields redacted simultaneously'
    );

SELECT *
FROM
    finish();

ROLLBACK;
