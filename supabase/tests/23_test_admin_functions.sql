BEGIN;


SELECT plan(16);

-- =============================================================================
-- Test that internal functions WORK for postgres
-- =============================================================================


SELECT
    lives_ok(
        'SELECT delete_old_deleted_apps()',
        'delete_old_deleted_apps test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT cleanup_frequent_job_details()',
        'cleanup_frequent_job_details test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT remove_old_jobs()',
        'remove_old_jobs test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT delete_http_response(999999)',
        'delete_http_response test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT set_mau_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        'set_mau_exceeded_by_org test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT set_bandwidth_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        'set_bandwidth_exceeded_by_org test - works for service_role'
    );

SELECT
    lives_ok(
        'SELECT set_storage_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        'set_storage_exceeded_by_org test - works for service_role'
    );

-- Test delete_user (should be safe to test as it requires authentication)
SELECT tests.authenticate_as('test_user');

-- Note: This function deletes the current user, so we test it exists but don't actually call it
SELECT
    ok(
        pg_get_functiondef('delete_user()'::regprocedure) IS NOT NULL,
        'delete_user test - function exists'
    );

SELECT tests.clear_authentication();

-- =============================================================================
-- Test that internal functions are DENIED to authenticated users
-- =============================================================================

-- Test delete_old_deleted_apps (internal cron function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT delete_old_deleted_apps()',
        '42501',
        'permission denied for function delete_old_deleted_apps',
        'delete_old_deleted_apps test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test cleanup_frequent_job_details (internal cron function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT cleanup_frequent_job_details()',
        '42501',
        'permission denied for function cleanup_frequent_job_details',
        'cleanup_frequent_job_details test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test remove_old_jobs (internal cron function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT remove_old_jobs()',
        '42501',
        'permission denied for function remove_old_jobs',
        'remove_old_jobs test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test delete_http_response (internal function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT delete_http_response(999999)',
        '42501',
        'permission denied for function delete_http_response',
        'delete_http_response test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test set_mau_exceeded_by_org (internal function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT set_mau_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        '42501',
        'permission denied for function set_mau_exceeded_by_org',
        'set_mau_exceeded_by_org test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test set_bandwidth_exceeded_by_org (internal function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT set_bandwidth_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        '42501',
        'permission denied for function set_bandwidth_exceeded_by_org',
        'set_bandwidth_exceeded_by_org test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- Test set_storage_exceeded_by_org (internal function - should be denied to authenticated users)
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        'SELECT set_storage_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
        '42501',
        'permission denied for function set_storage_exceeded_by_org',
        'set_storage_exceeded_by_org test - throws permission error for authenticated user'
    );

SELECT tests.clear_authentication();

-- =============================================================================
-- Other tests
-- =============================================================================

-- Test verify_mfa (returns true when not authenticated in test environment)
SELECT
    is(
        verify_mfa(),
        TRUE,
        'verify_mfa test - returns true in test environment'
    );

SELECT *
FROM
    finish();

ROLLBACK;
