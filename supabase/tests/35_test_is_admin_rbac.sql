-- Test is_admin() with RBAC integration
BEGIN;
SELECT plan(7);

-- Test admin user: 'test_admin' maps to c591b04e-cf29-4945-b9a0-776d0672061a (admin@capgo.app)
-- Test regular user: 'test_user' maps to 6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5 (test@capgo.app)

-- 1) With RBAC disabled globally, is_admin() uses admin_users secret
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    (SELECT use_new_rbac FROM public.rbac_settings WHERE id = 1) = false,
    'RBAC is disabled globally by default'
);

-- 2) Admin user is recognized through admin_users
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    public.is_admin('c591b04e-cf29-4945-b9a0-776d0672061a'),
    'Admin is recognized through admin_users secret'
);

-- 3) Regular user without admin_users entry is not admin
SELECT tests.authenticate_as('test_user');
SELECT ok(
    NOT public.is_admin('6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'),
    'Regular user is NOT admin (not in admin_users)'
);

-- 4) Enable RBAC globally
SELECT tests.authenticate_as('test_admin');
UPDATE public.rbac_settings SET use_new_rbac = true WHERE id = 1;
SELECT ok(
    (SELECT use_new_rbac FROM public.rbac_settings WHERE id = 1) = true,
    'RBAC enabled globally'
);

-- 5) Admin remains recognized in RBAC mode via admin_users entry
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    public.is_admin('c591b04e-cf29-4945-b9a0-776d0672061a'),
    'Admin still recognized in RBAC mode via admin_users path'
);

-- 6) Grant platform_super_admin role to regular user for RBAC-only coverage
SET LOCAL ROLE service_role;
INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    granted_by
)
SELECT
    'user',
    '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
    r.id,
    'platform',
    'c591b04e-cf29-4945-b9a0-776d0672061a'
FROM public.roles r
WHERE r.name = 'platform_super_admin';
RESET ROLE;

-- 7) RBAC platform role should not grant is_admin() (admin_users-only check)
SELECT tests.authenticate_as('test_user');
SELECT ok(
    NOT public.is_admin('6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'),
    'Platform role users remain non-admin for is_admin() admin_users check'
);

SELECT * FROM finish();
ROLLBACK;
