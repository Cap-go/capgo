-- Test is_admin() function with RBAC integration
BEGIN;
SELECT plan(7);

-- Test admin user: 'test_admin' maps to c591b04e-cf29-4945-b9a0-776d0672061a (admin@capgo.app)
-- Test regular user: 'test_user' maps to 6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5 (test@capgo.app)

-- 1) In legacy mode (RBAC disabled globally), is_admin() uses vault secret
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    (SELECT use_new_rbac FROM public.rbac_settings WHERE id = 1) = false,
    'RBAC is disabled globally by default'
);

-- 2) Admin user is recognized in legacy mode (assumes MFA is mocked in test environment)
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    public.is_admin('c591b04e-cf29-4945-b9a0-776d0672061a'),
    'Admin is recognized in legacy mode (vault-based)'
);

-- 3) Enable RBAC globally
SELECT tests.authenticate_as('test_admin');
UPDATE public.rbac_settings SET use_new_rbac = true WHERE id = 1;
SELECT ok(
    (SELECT use_new_rbac FROM public.rbac_settings WHERE id = 1) = true,
    'RBAC enabled globally'
);

-- 4) With RBAC enabled, admin is STILL recognized via vault (for bootstrapping)
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    public.is_admin('c591b04e-cf29-4945-b9a0-776d0672061a'),
    'Admin still recognized in RBAC mode via vault (bootstrapping)'
);

-- 5) Grant platform_super_admin role to test_admin
INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    family_name,
    granted_by
)
SELECT
    'user',
    'c591b04e-cf29-4945-b9a0-776d0672061a',
    r.id,
    'platform',
    'platform_base',
    'c591b04e-cf29-4945-b9a0-776d0672061a'
FROM public.roles r
WHERE r.name = 'platform_super_admin';

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
        WHERE rb.principal_id = 'c591b04e-cf29-4945-b9a0-776d0672061a'
        AND r.name = 'platform_super_admin'
        AND rb.scope_type = 'platform'
    ),
    'platform_super_admin role binding created for test_admin'
);

-- 6) Admin is still recognized with RBAC role
SELECT tests.authenticate_as('test_admin');
SELECT ok(
    public.is_admin('c591b04e-cf29-4945-b9a0-776d0672061a'),
    'Admin recognized in RBAC mode with platform_super_admin role'
);

-- 7) Regular user without vault entry and without platform role is NOT admin
SELECT tests.authenticate_as('test_user');
SELECT ok(
    NOT public.is_admin('6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'),
    'Regular user is NOT admin (not in vault, no platform role)'
);

SELECT * FROM finish();
ROLLBACK;
