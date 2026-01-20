BEGIN;

SELECT plan(6);

-- Test fixtures - DEDICATED DATA FOR TEST ISOLATION (parallel test execution)
-- Create dedicated test users to avoid conflicts with other parallel tests
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES 
  ('33333333-3333-4333-8333-333333333333', 'rbac_phase1_admin@test.local', crypt('testpass', gen_salt('bf')), NOW(), NOW(), NOW(), '{}'),
  ('44444444-4444-4444-8444-444444444444', 'rbac_phase1_member@test.local', crypt('testpass', gen_salt('bf')), NOW(), NOW(), NOW(), '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
  ('33333333-3333-4333-8333-333333333333', 'rbac_phase1_admin@test.local', NOW(), NOW()),
  ('44444444-4444-4444-8444-444444444444', 'rbac_phase1_member@test.local', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

WITH seed_data AS (
  SELECT
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac,
    'com.rbac.legacy'::text AS app_legacy,
    'com.rbac.new'::text AS app_rbac,
    9876500001::bigint AS channel_rbac_id,
    'rbac-test-key-phase1'::text AS api_key_value
)
INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
SELECT org_legacy, admin_user, 'Legacy Org (RBAC off)', 'legacy-rbac@example.com', false FROM seed_data
ON CONFLICT (id) DO NOTHING;

WITH seed_data AS (
  SELECT
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
SELECT org_rbac, admin_user, 'RBAC Org', 'rbac-enabled@example.com', true FROM seed_data
ON CONFLICT (id) DO NOTHING;

-- Legacy app + membership (exercises fallback path)
WITH seed_data AS (
  SELECT
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy,
    'com.rbac.legacy'::text AS app_legacy
)
INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
SELECT app_legacy, 'http://example.com/icon.png', admin_user, 'Legacy App', org_legacy FROM seed_data
ON CONFLICT (app_id) DO NOTHING;

WITH seed_data AS (
  SELECT
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    '11111111-1111-4111-8111-111111111111'::uuid AS org_legacy
)
INSERT INTO public.org_users (user_id, org_id, user_right)
SELECT member_user, org_legacy, 'admin'::public.user_min_right FROM seed_data
ON CONFLICT DO NOTHING;

-- RBAC app + channel
WITH seed_data AS (
  SELECT
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac,
    'com.rbac.new'::text AS app_rbac
)
INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
SELECT app_rbac, 'http://example.com/icon.png', admin_user, 'RBAC App', org_rbac FROM seed_data
ON CONFLICT (app_id) DO NOTHING;

WITH seed_data AS (
  SELECT
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
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
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    'rbac-test-key-phase1'::text AS api_key_value
)
INSERT INTO public.apikeys (user_id, key, mode, name)
SELECT member_user, api_key_value, 'all'::public.key_mode, 'rbac-test-apikey' FROM seed_data;

-- RBAC bindings (org_admin to user, app_admin to apikey)
WITH seed_data AS (
  SELECT
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
DELETE FROM public.role_bindings
WHERE principal_type = 'user' 
  AND principal_id = (SELECT member_user FROM seed_data)
  AND scope_type = 'org'
  AND org_id = (SELECT org_rbac FROM seed_data);

WITH seed_data AS (
  SELECT
    '44444444-4444-4444-8444-444444444444'::uuid AS member_user,
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT 'user', member_user, r.id, 'org', org_rbac, admin_user
FROM public.roles r, seed_data
WHERE r.name = 'org_admin';

WITH seed_data AS (
  SELECT
    'rbac-test-key-phase1'::text AS api_key_value,
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
DELETE FROM public.role_bindings
WHERE principal_type = 'apikey'
  AND principal_id IN (SELECT rbac_id FROM public.apikeys WHERE key = (SELECT api_key_value FROM seed_data))
  AND scope_type = 'app'
  AND app_id IN (SELECT id FROM public.apps WHERE app_id = 'com.rbac.new');

WITH seed_data AS (
  SELECT
    'rbac-test-key-phase1'::text AS api_key_value,
    '33333333-3333-4333-8333-333333333333'::uuid AS admin_user,
    '22222222-2222-4222-8222-222222222222'::uuid AS org_rbac
)
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, app_id, granted_by)
SELECT 'apikey', api.rbac_id, r.id, 'app', org_rbac, a.id, admin_user
FROM public.apikeys api, public.roles r, public.apps a, seed_data
WHERE api.key = api_key_value
  AND r.name = 'app_admin'
  AND a.app_id = 'com.rbac.new';

-- 1) Legacy path still works when RBAC flag is off
SELECT
  ok(
    public.rbac_check_permission_direct(
      'org.update_settings',
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111',
      NULL::varchar,
      NULL::bigint,
      NULL::varchar
    ),
    'Legacy org_users rights honored when RBAC disabled'
  );

-- 2) RBAC grants org_admin via role_binding (no org_users row)
SELECT
  ok(
    public.rbac_check_permission_direct(
      'org.update_user_roles',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      NULL::varchar,
      NULL::bigint,
      NULL::varchar
    ),
    'RBAC org_admin binding grants org.update_user_roles permission'
  );

-- 3) Hierarchy: org_admin inherits channel permissions
SELECT
  ok(
    public.rbac_check_permission_direct(
      'channel.update_settings',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'com.rbac.new',
      9876500001,
      NULL::varchar
    ),
    'Org admin role cascades to channel-level permissions'
  );

-- 4) SSD: cannot add another role in same scope for same principal
SELECT
  throws_ok(
    $q$
      INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
      SELECT 'user', '44444444-4444-4444-8444-444444444444', r.id, 'org', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'
      FROM public.roles r
      WHERE r.name = 'org_billing_admin';
    $q$,
    'duplicate key value violates unique constraint "role_bindings_org_scope_uniq"',
    'SSD unique index blocks multiple org roles for same org/principal'
  );

-- 5) API key bindings honored under RBAC
SELECT
  ok(
    public.rbac_check_permission_direct(
      'app.update_settings',
      '44444444-4444-4444-8444-444444444444',
      NULL::uuid,
      'com.rbac.new',
      NULL::bigint,
      'rbac-test-key-phase1'
    ),
    'App admin binding on apikey grants app.update_settings permission'
  );

-- 6) Disabling RBAC removes RBAC-granted access when no legacy rights exist
UPDATE public.orgs SET use_new_rbac = false WHERE id = '22222222-2222-4222-8222-222222222222';

SELECT
  ok(
    NOT public.rbac_check_permission_direct(
      'org.update_user_roles',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      NULL::varchar,
      NULL::bigint,
      NULL::varchar
    ),
    'RBAC-disabled org falls back to legacy (no rights without org_users row)'
  );

SELECT * FROM finish();

ROLLBACK;
