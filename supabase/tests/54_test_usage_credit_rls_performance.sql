BEGIN;

SELECT plan(13);

SELECT
  ok(
    to_regprocedure('public.usage_credit_readable_org_ids()') IS NOT NULL,
    'usage_credit_readable_org_ids helper exists'
  );

SELECT
  ok(
    position(
      'check_min_rights' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids keeps exact check_min_rights authorization'
  );

SELECT
  ok(
    position(
      'rbac_check_permission_direct' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids verifies API-key RBAC permission with direct checks'
  );

SELECT
  ok(
    position(
      'v_api_key.id IS NOT NULL' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids separates API-key and plain user authorization'
  );

SELECT
  ok(
    position(
      'v_user_id := v_api_key.user_id' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids passes the API key owner through exact permission checks'
  );

SELECT
  ok(
    NOT has_function_privilege('public', 'public.usage_credit_readable_org_ids()', 'EXECUTE'),
    'usage_credit_readable_org_ids does not grant EXECUTE to public'
  );

SELECT
  ok(
    has_function_privilege('anon', 'public.usage_credit_readable_org_ids()', 'EXECUTE'),
    'usage_credit_readable_org_ids grants EXECUTE to anon for API-key RLS'
  );

SELECT
  ok(
    has_function_privilege('authenticated', 'public.usage_credit_readable_org_ids()', 'EXECUTE'),
    'usage_credit_readable_org_ids grants EXECUTE to authenticated users'
  );

SELECT
  is(
    (
      SELECT count(*)
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'usage_credit_consumptions',
          'usage_credit_grants',
          'usage_credit_transactions',
          'usage_overage_events'
        )
        AND cmd = 'SELECT'
        AND qual LIKE '%usage_credit_readable_org_ids%'
        AND qual ~* '[(][[:space:]]*select[[:space:]]+.*usage_credit_readable_org_ids[(][)]'
    ),
    4::bigint,
    'usage credit SELECT policies use the initPlan readable-org helper via subselect'
  );

SELECT
  is(
    (
      SELECT count(*)
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'usage_credit_consumptions',
          'usage_credit_grants',
          'usage_credit_transactions',
          'usage_overage_events'
        )
        AND cmd = 'SELECT'
        AND qual LIKE '%get_identity_org_allowed%'
    ),
    0::bigint,
    'usage credit SELECT policies avoid per-row identity resolution'
  );

SELECT
  is(
    (
      SELECT count(*)
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'usage_credit_consumptions',
          'usage_credit_grants',
          'usage_credit_transactions',
          'usage_overage_events'
        )
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
        AND policyname IN (
          'Deny insert for org members',
          'Deny update for org members',
          'Deny delete for org members'
        )
        AND permissive = 'RESTRICTIVE'
        AND roles @> ARRAY['anon', 'authenticated']::name[]
    ),
    12::bigint,
    'usage credit write operations have explicit restrictive deny policies'
  );

SET LOCAL ROLE anon;
SELECT
  is(
    public.usage_credit_readable_org_ids(),
    '{}'::uuid[],
    'anon without a Capgo API key cannot read usage credit orgs'
  );
RESET ROLE;

INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data
)
VALUES (
  '70000000-0000-4000-8000-000000005401',
  'usage-credit-rbac-key-owner@test.local',
  crypt('testpass', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES (
  '70000000-0000-4000-8000-000000005401',
  'usage-credit-rbac-key-owner@test.local',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_security (
  user_id,
  email_otp_verified_at,
  created_at,
  updated_at
)
VALUES (
  '70000000-0000-4000-8000-000000005401',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE
SET
  email_otp_verified_at = EXCLUDED.email_otp_verified_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO auth.mfa_factors (
  id,
  user_id,
  friendly_name,
  factor_type,
  status,
  created_at,
  updated_at
)
VALUES (
  '70000000-0000-4000-8000-000000005402',
  '70000000-0000-4000-8000-000000005401',
  'Usage Credit RBAC API Key Owner OTP',
  'totp'::auth.factor_type,
  'verified'::auth.factor_status,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (
  id,
  created_by,
  name,
  management_email,
  use_new_rbac,
  enforcing_2fa
)
VALUES (
  '70000000-0000-4000-8000-000000000054',
  '70000000-0000-4000-8000-000000005401',
  'Usage Credit RBAC API key org',
  'usage-credit-rbac-key@test.local',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

SELECT tests.create_v2_apikey(
  54054,
  '70000000-0000-4000-8000-000000005401',
  'usage-credit-rbac-only-key',
  'usage-credit-rbac-only-key'
);

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  granted_by
)
SELECT
  public.rbac_principal_apikey(),
  apikeys.rbac_id,
  roles.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000054',
  '70000000-0000-4000-8000-000000005401'
FROM public.apikeys
CROSS JOIN public.roles
WHERE apikeys.id = 54054
  AND roles.name = public.rbac_role_org_admin()
ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('request.jwt.claim.role', NULL, true);
SELECT set_config('request.jwt.claim.email', NULL, true);
SELECT set_config('request.headers', '{"capgkey": "usage-credit-rbac-only-key"}', true);

SET LOCAL ROLE anon;
SELECT
  ok(
    '70000000-0000-4000-8000-000000000054'::uuid
    = ANY(public.usage_credit_readable_org_ids()),
    'RBAC-only API keys can read usage credit orgs with exact permission checks'
  );
RESET ROLE;

SELECT set_config('request.headers', '{}', true);

SELECT * FROM finish();

ROLLBACK;
