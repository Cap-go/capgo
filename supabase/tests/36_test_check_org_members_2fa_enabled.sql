BEGIN;

SELECT plan(12);

-- Create test users for this test
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_org_member_1', 'member1@test.com');
  PERFORM tests.create_supabase_user('test_org_member_2', 'member2@test.com');
  PERFORM tests.create_supabase_user('test_org_member_3', 'member3@test.com');
  PERFORM tests.create_supabase_user('test_org_member_4', 'member4@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
    (tests.get_supabase_uid('test_org_member_1'), 'member1@test.com', now(), now()),
    (tests.get_supabase_uid('test_org_member_2'), 'member2@test.com', now(), now()),
    (tests.get_supabase_uid('test_org_member_3'), 'member3@test.com', now(), now()),
    (tests.get_supabase_uid('test_org_member_4'), 'member4@test.com', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Create a test org
DO $$
DECLARE
    test_org_id uuid;
    super_admin_id uuid;
    member1_id uuid;
    member2_id uuid;
    member3_id uuid;
    member4_id uuid;
BEGIN
    test_org_id := extensions.uuid_generate_v4();
    super_admin_id := tests.get_supabase_uid('test_admin');
    member1_id := tests.get_supabase_uid('test_org_member_1');
    member2_id := tests.get_supabase_uid('test_org_member_2');
    member3_id := tests.get_supabase_uid('test_org_member_3');
    member4_id := tests.get_supabase_uid('test_org_member_4');

    -- Create org (trigger will automatically add created_by as super_admin)
    INSERT INTO public.orgs (id, created_by, name, management_email)
    VALUES (test_org_id, super_admin_id, 'Test 2FA Org', 'test@capgo.app');

    -- Add members with different roles
    INSERT INTO public.org_users (org_id, user_id, user_right)
    VALUES 
        (test_org_id, member1_id, 'read'::public.user_min_right),
        (test_org_id, member2_id, 'write'::public.user_min_right),
        (test_org_id, member3_id, 'admin'::public.user_min_right),
        (test_org_id, member4_id, 'read'::public.user_min_right);

    -- Store org_id for later use
    PERFORM set_config('test.org_id', test_org_id::text, false);
END $$;

-- Get the test org_id
DO $$
DECLARE
    test_org_id uuid;
    member1_id uuid;
    member2_id uuid;
    member3_id uuid;
    member4_id uuid;
BEGIN
    test_org_id := current_setting('test.org_id')::uuid;
    member1_id := tests.get_supabase_uid('test_org_member_1');
    member2_id := tests.get_supabase_uid('test_org_member_2');
    member3_id := tests.get_supabase_uid('test_org_member_3');
    member4_id := tests.get_supabase_uid('test_org_member_4');

    -- Insert verified MFA factor for member1
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        member1_id,
        'Test TOTP',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        now(),
        now()
    );

    -- Insert verified MFA factor for member4 (to test multiple members with 2FA)
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        member4_id,
        'Test TOTP Member4',
        'totp'::auth.factor_type,
        'verified'::auth.factor_status,
        now(),
        now()
    );

    -- Insert unverified MFA factor for member2 (should not count)
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    VALUES (
        extensions.uuid_generate_v4(),
        member2_id,
        'Test TOTP Unverified',
        'totp'::auth.factor_type,
        'unverified'::auth.factor_status,
        now(),
        now()
    );

    -- member3 has no MFA factors
END $$;

-- Test 1: Super admin can call the function
SELECT tests.authenticate_as('test_admin');

SELECT
    ok(
        (
            SELECT count(*) >= 0
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
        ),
        'check_org_members_2fa_enabled test - super_admin can call function'
    );

-- Test 2: Verify the function returns correct number of members
-- Note: Returns 5 because org creation trigger adds created_by as super_admin + 4 members
SELECT
    is(
        (
            SELECT count(*)::int
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
        ),
        5,
        'check_org_members_2fa_enabled test - returns correct number of members'
    );

-- Test 3: Verify member1 has 2FA enabled
SELECT
    is(
        (
            SELECT "2fa_enabled"
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_org_member_1')
        ),
        true,
        'check_org_members_2fa_enabled test - member with verified 2FA returns true'
    );

-- Test 3b: Verify super_admin's 2FA status is included in results
SELECT
    ok(
        (
            SELECT "2fa_enabled" IS NOT NULL
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_admin')
        ),
        'check_org_members_2fa_enabled test - super_admin 2FA status is included in results'
    );

-- Test 3c: Verify super_admin without 2FA returns false
SELECT
    is(
        (
            SELECT "2fa_enabled"
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_admin')
        ),
        false,
        'check_org_members_2fa_enabled test - super_admin without 2FA returns false'
    );

-- Test 4: Verify member2 has 2FA disabled (unverified factor doesn't count)
SELECT
    is(
        (
            SELECT "2fa_enabled"
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_org_member_2')
        ),
        false,
        'check_org_members_2fa_enabled test - member with unverified 2FA returns false'
    );

-- Test 5: Verify member3 has 2FA disabled (no factors)
SELECT
    is(
        (
            SELECT "2fa_enabled"
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_org_member_3')
        ),
        false,
        'check_org_members_2fa_enabled test - member without 2FA returns false'
    );

-- Test 5b: Verify member4 has 2FA enabled (has verified factor)
SELECT
    is(
        (
            SELECT "2fa_enabled"
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE user_id = tests.get_supabase_uid('test_org_member_4')
        ),
        true,
        'check_org_members_2fa_enabled test - member with verified 2FA returns true'
    );

-- Test 5c: Verify all members with 2FA return true (member1 and member4)
SELECT
    is(
        (
            SELECT count(*)::int
            FROM check_org_members_2fa_enabled(current_setting('test.org_id')::uuid)
            WHERE "2fa_enabled" = true
        ),
        2,
        'check_org_members_2fa_enabled test - all members with verified 2FA return true'
    );

SELECT tests.clear_authentication();

-- Test 6: Non-super_admin user cannot call the function
SELECT tests.authenticate_as('test_user');

SELECT
    throws_ok(
        format('SELECT * FROM check_org_members_2fa_enabled(''%s'')', current_setting('test.org_id')::uuid),
        'NO_RIGHTS',
        'check_org_members_2fa_enabled test - non-super_admin cannot call function'
    );

SELECT tests.clear_authentication();

-- Test 7: Non-existent org raises exception
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        format('SELECT * FROM check_org_members_2fa_enabled(''%s'')', extensions.uuid_generate_v4()),
        'Organization does not exist',
        'check_org_members_2fa_enabled test - non-existent org raises exception'
    );

SELECT tests.clear_authentication();

-- Test 8: Verify function exists
SELECT
    ok(
        pg_get_functiondef('check_org_members_2fa_enabled(uuid)'::regprocedure) IS NOT NULL,
        'check_org_members_2fa_enabled test - function exists'
    );

SELECT *
FROM
    finish();

ROLLBACK;

