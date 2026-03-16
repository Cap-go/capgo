BEGIN;


SELECT plan(16);

-- Test is_platform_admin wrapper
SELECT tests.authenticate_as('test_admin');

SELECT
    is(
        is_platform_admin(),
        true,
        'is_platform_admin test - admin secret user is platform admin'
    );

SELECT tests.clear_authentication();

SELECT tests.authenticate_as('test_user');

SELECT
    is(
        is_platform_admin(),
        false,
        'is_platform_admin test - user is not platform admin without admin_users secret'
    );

SELECT tests.clear_authentication();

-- Test split behavior when an RBAC role exists (RBAC roles should not affect is_platform_admin)
SET LOCAL ROLE service_role;
INSERT INTO public.orgs (id, created_by, name, management_email)
VALUES (
    '55555555-5555-4555-8555-555555555555',
    tests.get_supabase_uid('test_admin'),
    'Auth function role test org',
    'auth-function-role-test@capgo.app'
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.role_bindings
WHERE
    principal_type = 'user'
    AND principal_id = tests.get_supabase_uid('test_user')
    AND scope_type = 'org'
    AND org_id = '55555555-5555-4555-8555-555555555555';
INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    granted_by
)
SELECT
    'user',
    tests.get_supabase_uid('test_user'),
    r.id,
    'org',
    '55555555-5555-4555-8555-555555555555',
    tests.get_supabase_uid('test_admin')
FROM public.roles AS r
WHERE r.name = public.rbac_role_org_super_admin();
RESET ROLE;

SELECT tests.authenticate_as('test_user');

SELECT
    is(
        is_platform_admin(),
        false,
        'is_platform_admin wrapper test - RBAC roles are not checked in admin secret function'
    );

SELECT tests.clear_authentication();

-- Test is_allowed_capgkey
SELECT
    is(
        is_allowed_capgkey('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', '{all}'),
        true,
        'is_allowed_capgkey test - key has correct mode'
    );

SELECT
    is(
        is_allowed_capgkey('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', '{read}'),
        false,
        'is_allowed_capgkey test - key does not have correct mode'
    );

SELECT
    is(
        is_allowed_capgkey('ae6e7458-c46d-4c00-aa3b-153b0b8520ec', '{all}'),
        false,
        'is_allowed_capgkey test - key does not exist'
    );

-- Test is_allowed_capgkey with app_id
SELECT
    is(
        is_allowed_capgkey(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            '{all}',
            'com.demo.app'
        ),
        true,
        'is_allowed_capgkey test with app_id - key has correct mode and user is app owner'
    );

SELECT
    is(
        is_allowed_capgkey(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            '{all}',
            'com.demoadmin.app'
        ),
        false,
        'is_allowed_capgkey test with app_id - user is not app owner'
    );

-- ============================================================================
-- Test is_allowed_capgkey with hashed API keys
-- ============================================================================
-- Test data is seeded in seed.sql:
--   - id=100: hashed key 'test-hashed-apikey-for-auth-test' (all mode)
--   - id=101: expired hashed key 'expired-hashed-key-for-test' (all mode)
--   - id=102: expired plain key 'expired-plain-key-for-test' (all mode)

SELECT
    is(
        is_allowed_capgkey('test-hashed-apikey-for-auth-test', '{all}'),
        true,
        'is_allowed_capgkey test - hashed key has correct mode'
    );

SELECT
    is(
        is_allowed_capgkey('test-hashed-apikey-for-auth-test', '{read}'),
        false,
        'is_allowed_capgkey test - hashed key does not have correct mode'
    );

SELECT
    is(
        is_allowed_capgkey(
            'test-hashed-apikey-for-auth-test',
            '{all}',
            'com.demo.app'
        ),
        true,
        'is_allowed_capgkey test with app_id - hashed key user is app owner'
    );

-- ============================================================================
-- Test is_allowed_capgkey with expired API keys
-- ============================================================================

SELECT
    is(
        is_allowed_capgkey('expired-hashed-key-for-test', '{all}'),
        false,
        'is_allowed_capgkey test - expired hashed key should fail'
    );

SELECT
    is(
        is_allowed_capgkey('expired-plain-key-for-test', '{all}'),
        false,
        'is_allowed_capgkey test - expired plain key should fail'
    );

-- ============================================================================
-- Test get_user_id with hashed API keys
-- ============================================================================

SELECT
    is(
        get_user_id('test-hashed-apikey-for-auth-test'),
        tests.get_supabase_uid('test_user'),
        'get_user_id test - hashed key returns correct user_id'
    );

SELECT
    is(
        get_user_id('expired-hashed-key-for-test'),
        null,
        'get_user_id test - expired hashed key returns null'
    );

SELECT
    is(
        get_user_id('expired-plain-key-for-test'),
        null,
        'get_user_id test - expired plain key returns null'
    );

SELECT *
FROM
    finish();

ROLLBACK;
