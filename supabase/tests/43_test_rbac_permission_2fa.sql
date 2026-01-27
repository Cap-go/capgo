BEGIN;

SELECT plan(4);

-- Create isolated test users
DO $$
BEGIN
  PERFORM tests.create_supabase_user('test_rbac_2fa_user', 'rbac_2fa@test.com');
  PERFORM tests.create_supabase_user('test_rbac_no2fa_user', 'rbac_no2fa@test.com');
END $$;

-- Create entries in public.users for the test members
INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
(
  tests.get_supabase_uid('test_rbac_2fa_user'),
  'rbac_2fa@test.com',
  now(),
  now()
),
(
  tests.get_supabase_uid('test_rbac_no2fa_user'),
  'rbac_no2fa@test.com',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Create test orgs and memberships
DO $$
DECLARE
  org_with_2fa_enforcement_id uuid;
  org_without_2fa_enforcement_id uuid;
  test_2fa_user_id uuid;
  test_no2fa_user_id uuid;
BEGIN
  org_with_2fa_enforcement_id := gen_random_uuid();
  org_without_2fa_enforcement_id := gen_random_uuid();
  test_2fa_user_id := tests.get_supabase_uid('test_rbac_2fa_user');
  test_no2fa_user_id := tests.get_supabase_uid('test_rbac_no2fa_user');

  -- Create org WITH 2FA enforcement
  INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
  VALUES (org_with_2fa_enforcement_id, test_2fa_user_id, 'RBAC 2FA Enforced Org', 'rbac_2fa@org.com', true);

  -- Create org WITHOUT 2FA enforcement
  INSERT INTO public.orgs (id, created_by, name, management_email, enforcing_2fa)
  VALUES (org_without_2fa_enforcement_id, test_2fa_user_id, 'RBAC No 2FA Org', 'rbac_no2fa@org.com', false);

  -- Add members to org WITH 2FA enforcement
  INSERT INTO public.org_users (org_id, user_id, user_right)
  VALUES
    (org_with_2fa_enforcement_id, test_2fa_user_id, 'admin'::public.user_min_right),
    (org_with_2fa_enforcement_id, test_no2fa_user_id, 'admin'::public.user_min_right);

  -- Add members to org WITHOUT 2FA enforcement
  INSERT INTO public.org_users (org_id, user_id, user_right)
  VALUES
    (org_without_2fa_enforcement_id, test_no2fa_user_id, 'admin'::public.user_min_right);

  -- Store org IDs for later use
  PERFORM set_config('test.rbac_org_with_2fa', org_with_2fa_enforcement_id::text, false);
  PERFORM set_config('test.rbac_org_without_2fa', org_without_2fa_enforcement_id::text, false);
END $$;

-- Set up MFA factor for the verified 2FA user
DO $$
DECLARE
  test_2fa_user_id uuid;
BEGIN
  test_2fa_user_id := tests.get_supabase_uid('test_rbac_2fa_user');

  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    test_2fa_user_id,
    'Test RBAC TOTP',
    'totp'::auth.factor_type,
    'verified'::auth.factor_status,
    NOW(),
    NOW()
  );
END $$;

-- Create an API key for the non-2FA user (for apikey-based permission checks)
INSERT INTO public.apikeys (id, user_id, key, mode, name)
VALUES (
  9101,
  tests.get_supabase_uid('test_rbac_no2fa_user'),
  'test-rbac-no2fa-key',
  'all'::public.key_mode,
  'Test RBAC No 2FA Key'
);

-- Enable RBAC for the test orgs
SELECT tests.authenticate_as_service_role();
SELECT public.rbac_enable_for_org(current_setting('test.rbac_org_with_2fa')::uuid, tests.get_supabase_uid('test_rbac_2fa_user'));
SELECT public.rbac_enable_for_org(current_setting('test.rbac_org_without_2fa')::uuid, tests.get_supabase_uid('test_rbac_2fa_user'));

-- Test 1: RBAC permission check allows 2FA-enabled user when org enforces 2FA
SELECT
  is(
    public.rbac_check_permission_direct(
      public.rbac_perm_org_update_settings(),
      tests.get_supabase_uid('test_rbac_2fa_user'),
      current_setting('test.rbac_org_with_2fa')::uuid,
      NULL::character varying,
      NULL::bigint,
      NULL
    ),
    true,
    'rbac_check_permission_direct 2FA enforcement test - verified 2FA user allowed'
  );

-- Test 2: RBAC permission check denies non-2FA user when org enforces 2FA
SELECT
  is(
    public.rbac_check_permission_direct(
      public.rbac_perm_org_update_settings(),
      tests.get_supabase_uid('test_rbac_no2fa_user'),
      current_setting('test.rbac_org_with_2fa')::uuid,
      NULL::character varying,
      NULL::bigint,
      NULL
    ),
    false,
    'rbac_check_permission_direct 2FA enforcement test - non-2FA user denied'
  );

-- Test 3: RBAC permission check allows non-2FA user when org does NOT enforce 2FA
SELECT
  is(
    public.rbac_check_permission_direct(
      public.rbac_perm_org_update_settings(),
      tests.get_supabase_uid('test_rbac_no2fa_user'),
      current_setting('test.rbac_org_without_2fa')::uuid,
      NULL::character varying,
      NULL::bigint,
      NULL
    ),
    true,
    'rbac_check_permission_direct 2FA enforcement test - non-2FA user allowed without enforcement'
  );

-- Test 4: RBAC permission check denies API key when org enforces 2FA and user lacks 2FA
SELECT
  is(
    public.rbac_check_permission_direct(
      public.rbac_perm_org_update_settings(),
      NULL::uuid,
      current_setting('test.rbac_org_with_2fa')::uuid,
      NULL::character varying,
      NULL::bigint,
      'test-rbac-no2fa-key'
    ),
    false,
    'rbac_check_permission_direct 2FA enforcement test - apikey denied for non-2FA user'
  );

SELECT * FROM finish();

ROLLBACK;
