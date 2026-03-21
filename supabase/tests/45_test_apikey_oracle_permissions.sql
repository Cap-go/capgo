BEGIN;

SELECT plan(9);

SELECT tests.clear_authentication();

SELECT
    throws_ok(
        format(
            'SELECT get_user_id(%L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
        ),
        '42501',
        'permission denied for function get_user_id',
        'get_user_id(testing_key) should not be callable as anon'
    );

SELECT
    throws_ok(
        format(
            'SELECT get_user_id(%L, %L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        '42501',
        'permission denied for function get_user_id',
        'get_user_id(testing_key, app_id) should not be callable as anon'
    );

SELECT
    throws_ok(
        format(
            'SELECT get_org_perm_for_apikey(%L, %L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        '42501',
        'permission denied for function get_org_perm_for_apikey',
        'get_org_perm_for_apikey should not be callable as anon'
    );

SELECT tests.authenticate_as('test_user');

SELECT
    throws_ok(
        format(
            'SELECT get_user_id(%L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
        ),
        '42501',
        'permission denied for function get_user_id',
        'authenticated user should not call get_user_id'
    );

SELECT
    throws_ok(
        format(
            'SELECT get_user_id(%L, %L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        '42501',
        'permission denied for function get_user_id',
        'authenticated user should not call get_user_id with app_id'
    );

SELECT
    throws_ok(
        format(
            'SELECT get_org_perm_for_apikey(%L, %L)',
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        '42501',
        'permission denied for function get_org_perm_for_apikey',
        'authenticated user should not call get_org_perm_for_apikey'
    );

SELECT tests.authenticate_as_service_role();

SELECT
    is(
        get_user_id('ae6e7458-c46d-4c00-aa3b-153b0b8520ea'),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'service role should still call get_user_id'
    );

SELECT
    is(
        get_org_perm_for_apikey(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        'perm_owner',
        'service role should still call get_org_perm_for_apikey'
    );

SELECT
    is(
        get_user_id(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'service role should still call get_user_id with app_id'
    );

SELECT tests.clear_authentication();

SELECT finish();

ROLLBACK;
