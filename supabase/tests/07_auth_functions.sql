BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (7);

-- Test is_admin
SELECT
    tests.authenticate_as ('test_admin');

SELECT
    is (
        is_admin (),
        true,
        'is_admin test - user is admin'
    );

SELECT
    tests.clear_authentication ();

SELECT
    tests.authenticate_as ('test_user');

SELECT
    is (
        is_admin (),
        false,
        'is_admin test - user is not admin'
    );

SELECT
    tests.clear_authentication ();

-- Test is_allowed_capgkey
SELECT
    is (
        is_allowed_capgkey ('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', '{all}'),
        true,
        'is_allowed_capgkey test - key has correct mode'
    );

SELECT
    is (
        is_allowed_capgkey ('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', '{read}'),
        false,
        'is_allowed_capgkey test - key does not have correct mode'
    );

SELECT
    is (
        is_allowed_capgkey ('ae6e7458-c46d-4c00-aa3b-153b0b8520ec', '{all}'),
        false,
        'is_allowed_capgkey test - key does not exist'
    );

-- Test is_allowed_capgkey with app_id
SELECT
    is (
        is_allowed_capgkey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            '{all}',
            'com.demo.app'
        ),
        true,
        'is_allowed_capgkey test with app_id - key has correct mode and user is app owner'
    );

SELECT
    is (
        is_allowed_capgkey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            '{all}',
            'com.demoadmin.app'
        ),
        false,
        'is_allowed_capgkey test with app_id - user is not app owner'
    );

SELECT
    *
FROM
    finish ();

ROLLBACK;
