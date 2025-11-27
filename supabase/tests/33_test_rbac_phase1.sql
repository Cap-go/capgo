BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

-- RBAC Phase 1 sanity checks (feature flag + role bindings)
SELECT plan(6);

-- Test fixtures
-- Use seeded users to avoid recreating auth rows
WITH seed_data AS (
  SELECT
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac,
    'com.rbac.legacy'::text AS app_legacy,
    'com.rbac.new'::text AS app_rbac,
    9876500001::bigint AS channel_rbac_id,
    'rbac-test-key'::text AS api_key_value
)
INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
SELECT org_legacy, admin_user, 'Legacy Org (RBAC off)', 'legacy-rbac@example.com', false FROM seed_data
ON CONFLICT (id) DO NOTHING;

WITH seed_data AS (
  SELECT
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
SELECT org_rbac, admin_user, 'RBAC Org', 'rbac-enabled@example.com', true FROM seed_data
ON CONFLICT (id) DO NOTHING;

-- Legacy app + membership (exercises fallback path)
WITH seed_data AS (
  SELECT
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy,
    'com.rbac.legacy'::text AS app_legacy
)
INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
SELECT app_legacy, 'http://example.com/icon.png', admin_user, 'Legacy App', org_legacy FROM seed_data
ON CONFLICT (app_id) DO NOTHING;

WITH seed_data AS (
  SELECT
    '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy
)
INSERT INTO public.org_users (user_id, org_id, user_right)
SELECT member_user, org_legacy, 'admin'::public.user_min_right FROM seed_data
ON CONFLICT DO NOTHING;

-- RBAC app + channel
WITH seed_data AS (
  SELECT
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac,
    'com.rbac.new'::text AS app_rbac
)
INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
SELECT app_rbac, 'http://example.com/icon.png', admin_user, 'RBAC App', org_rbac FROM seed_data
ON CONFLICT (app_id) DO NOTHING;

WITH seed_data AS (
  SELECT
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac,
    'com.rbac.new'::text AS app_rbac,
    9876500001::bigint AS channel_rbac_id
)
INSERT INTO public.channels (id, name, app_id, version, owner_org, created_by)
OVERRIDING SYSTEM VALUE
SELECT channel_rbac_id, 'rbac-channel', app_rbac, 1, org_rbac, admin_user FROM seed_data
ON CONFLICT (id) DO NOTHING;

-- API key principal for RBAC app
WITH seed_data AS (
  SELECT
    '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid AS member_user,
    'rbac-test-key'::text AS api_key_value
)
INSERT INTO public.apikeys (user_id, key, mode, name)
SELECT member_user, api_key_value, 'all'::public.key_mode, 'rbac-test-apikey' FROM seed_data
ON CONFLICT (key) DO NOTHING;

-- RBAC bindings (org_admin to user, app_admin to apikey)
WITH seed_data AS (
  SELECT
    '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid AS member_user,
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT 'user', member_user, r.id, 'org', org_rbac, admin_user
FROM public.roles r, seed_data
WHERE r.name = 'org_admin'
ON CONFLICT DO NOTHING;

WITH seed_data AS (
  SELECT
    'rbac-test-key'::text AS api_key_value,
    'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, app_id, granted_by)
SELECT 'apikey', api.rbac_id, r.id, 'app', org_rbac, a.id, admin_user
FROM public.apikeys api, public.roles r, public.apps a, seed_data
WHERE api.key = api_key_value
  AND r.name = 'app_admin'
  AND a.app_id = 'com.rbac.new'
ON CONFLICT DO NOTHING;

-- Ensure global flag is off by default; org-level flag drives RBAC for rbac org
UPDATE public.rbac_settings SET use_new_rbac = false, updated_at = now() WHERE id = 1;

-- 1) Legacy path still works when RBAC flag is off
SELECT
  ok(
    public.check_min_rights(
      'admin'::public.user_min_right,
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      '11111111-1111-4111-8111-111111111111',
      NULL::varchar,
      NULL::bigint
    ),
    'Legacy org_users rights honored when RBAC disabled'
  );

-- Flip global flag on; org_rbac also has org-level flag set
UPDATE public.rbac_settings SET use_new_rbac = true, updated_at = now() WHERE id = 1;

-- 2) RBAC grants org_admin via role_binding (no org_users row)
SELECT
  ok(
    public.check_min_rights(
      'admin'::public.user_min_right,
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      '22222222-2222-4222-8222-222222222222',
      NULL::varchar,
      NULL::bigint
    ),
    'RBAC org_admin binding grants admin org rights'
  );

-- 3) Hierarchy: org_admin inherits channel permissions
SELECT
  ok(
    public.check_min_rights(
      'write'::public.user_min_right,
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      '22222222-2222-4222-8222-222222222222',
      'com.rbac.new',
      9876500001
    ),
    'Org admin role cascades to channel-level write permission'
  );

-- 4) SSD: cannot add another role in same family for same principal/scope
SELECT
  throws_ok(
    $q$
      INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
      SELECT 'user', '6aa76066-55ef-4238-ade6-0b32334a4097', r.id, 'org', '22222222-2222-4222-8222-222222222222', 'c591b04e-cf29-4945-b9a0-776d0672061a'
      FROM public.roles r
      WHERE r.name = 'org_billing_admin';
    $q$,
    'duplicate key value violates unique constraint "role_bindings_org_family_uniq"',
    'SSD unique index blocks multiple org_base roles for same org/principal'
  );

-- 5) API key bindings honored under RBAC
SELECT
  ok(
    public.has_app_right_apikey(
      'com.rbac.new',
      'write'::public.user_min_right,
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      'rbac-test-key'
    ),
    'App admin binding on apikey grants write/app-admin level access'
  );

-- 6) Disabling RBAC removes RBAC-granted access when no legacy rights exist
UPDATE public.rbac_settings SET use_new_rbac = false, updated_at = now() WHERE id = 1;
UPDATE public.orgs SET use_new_rbac = false WHERE id = '22222222-2222-4222-8222-222222222222';

SELECT
  ok(
    NOT public.check_min_rights(
      'admin'::public.user_min_right,
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      '22222222-2222-4222-8222-222222222222',
      NULL::varchar,
      NULL::bigint
    ),
    'RBAC-disabled org falls back to legacy (no rights without org_users row)'
  );

SELECT * FROM finish();

ROLLBACK;
