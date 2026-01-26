BEGIN;


SELECT plan(15);

-- Test is_admin
SELECT tests.authenticate_as('test_admin');

SELECT
    is(
        is_admin(),
        true,
        'is_admin test - user is admin'
    );

SELECT tests.clear_authentication();

SELECT tests.authenticate_as('test_user');

SELECT
    is(
        is_admin(),
        false,
        'is_admin test - user is not admin'
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
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
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
