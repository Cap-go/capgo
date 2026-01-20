-- supabase/tests/36_test_apikey_rbac.sql
-- Tests for API Key RBAC functions

BEGIN;
SELECT plan(14);

-- ============================================================================
-- Test Data Setup
-- ============================================================================

-- Create test user in auth.users first (to satisfy FK)
INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'apikey-test@example.com'),
  ('ffffffff-aaaa-bbbb-cccc-dddddddddddd'::uuid, 'apikey-test2@example.com')
ON CONFLICT (id) DO NOTHING;

-- Create test user if not exists
INSERT INTO public.users (id, email, first_name, last_name)
VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'apikey-test@example.com', 'Test', 'User'),
  ('ffffffff-aaaa-bbbb-cccc-dddddddddddd'::uuid, 'apikey-test2@example.com', 'Test2', 'User2')
ON CONFLICT (id) DO NOTHING;

-- Create test org
INSERT INTO public.orgs (id, name, created_by, management_email, use_new_rbac)
VALUES ('11111111-2222-3333-4444-555555555555'::uuid, 'Test Org for API Key RBAC', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'test@example.com', true)
ON CONFLICT (id) DO NOTHING;

-- Give the test user super_admin role in the org
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT 'user', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, r.id, 'org', '11111111-2222-3333-4444-555555555555'::uuid, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
FROM public.roles r WHERE r.name = 'org_super_admin'
ON CONFLICT DO NOTHING;

-- Create test API key
INSERT INTO public.apikeys (id, user_id, key, mode, name, rbac_id)
VALUES (99999, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'test-key-1234', 'all', 'Test API Key', 'cccccccc-dddd-eeee-ffff-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Create second API key for another user
INSERT INTO public.apikeys (id, user_id, key, mode, name, rbac_id)
VALUES (99998, 'ffffffff-aaaa-bbbb-cccc-dddddddddddd'::uuid, 'test-key-5678', 'all', 'Other User API Key', 'cccccccc-dddd-eeee-ffff-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Pre-Flight Checks
-- ============================================================================

-- Test 1: Check function existence
SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'get_available_roles_for_apikey'),
  'Function get_available_roles_for_apikey should exist in pg_proc'
);

-- Test 2: Check permission existence
SELECT ok(
  EXISTS(SELECT 1 FROM public.permissions WHERE key = 'org.apikey_read_roles'),
  'org.apikey_read_roles permission should exist'
);

-- ============================================================================
-- Functional Tests
-- ============================================================================

-- Test 3: get_available_roles_for_apikey returns org roles
SELECT ok(
  (SELECT COUNT(*) FROM public.get_available_roles_for_apikey('org'::text)) > 0,
  'get_available_roles_for_apikey should return org roles'
);

-- Test 4: get_available_roles_for_apikey returns app roles
SELECT ok(
  (SELECT COUNT(*) FROM public.get_available_roles_for_apikey('app'::text)) > 0,
  'get_available_roles_for_apikey should return app roles'
);

-- Test 5: get_available_roles_for_apikey returns channel roles
SELECT ok(
  (SELECT COUNT(*) FROM public.get_available_roles_for_apikey('channel'::text)) > 0,
  'get_available_roles_for_apikey should return channel roles'
);

-- Test 6: get_available_roles_for_apikey excludes platform roles
SELECT ok(
  (SELECT COUNT(*) FROM public.get_available_roles_for_apikey('org'::text) WHERE role_name LIKE 'platform_%') = 0,
  'get_available_roles_for_apikey should exclude platform roles'
);

-- Test 7: Verify permissions assigned to org_admin
SELECT ok(
  EXISTS(
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.name = 'org_admin' AND p.key = 'org.apikey_read_roles'
  ),
  'org_admin should have org.apikey_read_roles permission'
);

-- Test 8: Verify permissions assigned to org_super_admin
SELECT ok(
  EXISTS(
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.name = 'org_super_admin' AND p.key = 'org.apikey_update_roles'
  ),
  'org_super_admin should have org.apikey_update_roles permission'
);

-- Test 9: get_available_roles_for_apikey rejects invalid scope
SELECT throws_ok(
  $$SELECT * FROM public.get_available_roles_for_apikey('invalid'::text)$$,
  'INVALID_SCOPE_TYPE: Must be org, app, or channel',
  'get_available_roles_for_apikey should reject invalid scope type'
);

-- Test 10: Roles have correct scope types
SELECT ok(
  (SELECT COUNT(*) FROM public.get_available_roles_for_apikey('org'::text) WHERE scope_type != 'org') = 0,
  'All returned org roles should have scope_type = org'
);

-- Test 11: Only assignable roles are returned
SELECT ok(
  NOT EXISTS(
    SELECT 1
    FROM public.get_available_roles_for_apikey('org'::text) ar
    JOIN public.roles r ON r.id = ar.role_id
    WHERE r.is_assignable = false
  ),
  'get_available_roles_for_apikey should only return assignable roles'
);

-- Test 12: Org roles include expected roles
SELECT ok(
  EXISTS(SELECT 1 FROM public.get_available_roles_for_apikey('org'::text) WHERE role_name = 'org_admin'),
  'org_admin should be in available org roles'
);

-- Test 13: App roles include expected roles
SELECT ok(
  EXISTS(SELECT 1 FROM public.get_available_roles_for_apikey('app'::text) WHERE role_name = 'app_developer'),
  'app_developer should be in available app roles'
);

-- Test 14: Clean test (placeholder for any last check)
SELECT pass('Tests completed successfully');

-- ============================================================================
-- Cleanup
-- ============================================================================
DELETE FROM public.role_bindings WHERE org_id = '11111111-2222-3333-4444-555555555555'::uuid;
DELETE FROM public.apikeys WHERE id IN (99999, 99998);
DELETE FROM public.orgs WHERE id = '11111111-2222-3333-4444-555555555555'::uuid;
DELETE FROM public.users WHERE id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'ffffffff-aaaa-bbbb-cccc-dddddddddddd'::uuid);
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, 'ffffffff-aaaa-bbbb-cccc-dddddddddddd'::uuid);

SELECT * FROM finish();
ROLLBACK;
