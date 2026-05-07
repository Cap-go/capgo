BEGIN;

SELECT plan(10);

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
      'public.rbac_principal_apikey()' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids includes API-key RBAC candidates for mixed auth'
  );

SELECT
  ok(
    position(
      'NOT candidate_orgs.needs_api_key_scope' IN pg_get_functiondef('public.usage_credit_readable_org_ids()'::regprocedure)
    ) > 0,
    'usage_credit_readable_org_ids does not apply API-key org scope to plain user candidates'
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
    ),
    4::bigint,
    'usage credit SELECT policies use the initPlan readable-org helper'
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

SET LOCAL ROLE anon;
SELECT
  is(
    public.usage_credit_readable_org_ids(),
    '{}'::uuid[],
    'anon without a Capgo API key cannot read usage credit orgs'
  );
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
