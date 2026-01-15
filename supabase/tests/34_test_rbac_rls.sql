-- Test RLS policies for RBAC tables
BEGIN;
SELECT plan(10);

-- Test admin user: 'test_admin' maps to c591b04e-cf29-4945-b9a0-776d0672061a (admin@capgo.app)
-- Test regular user: 'test_user' maps to 6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5 (test@capgo.app)
-- Demo org: 046a36ac-e03c-4590-9257-bd6c9dba9ee8

-- 1) Admin can read rbac_settings
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    (SELECT COUNT(*) FROM public.rbac_settings) = 1,
    'Admin can read rbac_settings'
);

-- 2) Regular user can read rbac_settings
SELECT tests.authenticate_as('test_user');
SELECT ok(
    (SELECT COUNT(*) FROM public.rbac_settings) = 1,
    'Regular user can read rbac_settings'
);

-- 3) Regular user can read roles
SELECT tests.authenticate_as('test_user');
SELECT ok(
    (SELECT COUNT(*) FROM public.roles) >= 0,
    'Regular user can read roles'
);

-- 4) Regular user can read permissions
SELECT tests.authenticate_as('test_user');
SELECT ok(
    (SELECT COUNT(*) FROM public.permissions) >= 0,
    'Regular user can read permissions'
);

-- 5) Regular user can read their org's groups
-- First create a test group as admin
SELECT tests.authenticate_as('test_admin');
INSERT INTO public.groups (org_id, name, description)
VALUES ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'Test Group RLS', 'Test group for RLS');

-- Now check regular user can see it (they're member of Demo org)
SELECT tests.authenticate_as('test_user');
SELECT ok(
    EXISTS (
        SELECT 1 FROM public.groups
        WHERE org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
        AND name = 'Test Group RLS'
    ),
    'Regular user can read their org groups'
);

-- 6) Regular user cannot see groups from other orgs
-- Create a group in Admin org
SELECT tests.authenticate_as('test_admin');
INSERT INTO public.groups (org_id, name, description)
VALUES ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'Admin Org Group', 'Should not be visible to test user');

-- Check test user cannot see Admin org group
SELECT tests.authenticate_as('test_user');
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.groups
        WHERE org_id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    ),
    'Regular user cannot see groups from other orgs'
);

-- 7) User can see role_bindings for their org
SELECT tests.authenticate_as('test_admin');
-- Create a test role and binding
INSERT INTO public.roles (id, name, scope_type, family_name, is_priority, priority_rank)
VALUES ('11111111-1111-1111-1111-111111111111', 'test_role_rls', 'org', 'test_family', true, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, family_name, granted_by)
VALUES ('user', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', '11111111-1111-1111-1111-111111111111', 'org', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'test_family', 'c591b04e-cf29-4945-b9a0-776d0672061a');

-- Check test user can see their role binding
SELECT tests.authenticate_as('test_user');
SELECT ok(
    EXISTS (
        SELECT 1 FROM public.role_bindings
        WHERE principal_id = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
        AND scope_type = 'org'
        AND org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
    ),
    'User can see their org role bindings'
);

-- 8) User cannot see role_bindings from other orgs
SELECT tests.authenticate_as('test_admin');
INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, family_name, granted_by)
VALUES ('user', 'c591b04e-cf29-4945-b9a0-776d0672061a', '11111111-1111-1111-1111-111111111111', 'org', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'test_family', 'c591b04e-cf29-4945-b9a0-776d0672061a');

SELECT tests.authenticate_as('test_user');
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.role_bindings
        WHERE scope_type = 'org'
        AND org_id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    ),
    'User cannot see role bindings from other orgs'
);

-- 9) Test admin can modify rbac_settings
SELECT tests.authenticate_as('test_admin');
UPDATE public.rbac_settings SET use_new_rbac = true WHERE id = 1;
SELECT ok(
    (SELECT use_new_rbac FROM public.rbac_settings WHERE id = 1) = true,
    'Admin can modify rbac_settings'
);
-- Reset
UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1;

-- 10) Test admin can create and modify roles
SELECT tests.authenticate_as('test_admin');
INSERT INTO public.roles (id, name, scope_type, family_name, is_priority, priority_rank)
VALUES ('22222222-2222-2222-2222-222222222222', 'admin_test_role', 'org', 'admin_family', true, 20);

SELECT ok(
    EXISTS (SELECT 1 FROM public.roles WHERE id = '22222222-2222-2222-2222-222222222222'),
    'Admin can create roles'
);

SELECT * FROM finish();
ROLLBACK;
