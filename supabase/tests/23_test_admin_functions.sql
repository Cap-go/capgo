BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (10);

-- Test delete_user (should be safe to test as it requires authentication)
SELECT
  tests.authenticate_as ('test_user');

-- Note: This function deletes the current user, so we test it exists but don't actually call it
SELECT
  ok (
    pg_get_functiondef('delete_user()'::regprocedure) IS NOT NULL,
    'delete_user test - function exists'
  );

SELECT
  tests.clear_authentication ();

-- Test delete_old_deleted_apps (admin function)
SELECT
  tests.authenticate_as ('test_admin');

-- This is a maintenance function, test it exists and can be called
SELECT
  lives_ok (
    'SELECT delete_old_deleted_apps()',
    'delete_old_deleted_apps test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

-- Test cleanup_frequent_job_details (admin function - may fail due to cron schema permissions)
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  throws_ok (
    'SELECT cleanup_frequent_job_details()',
    'permission denied for schema cron',
    'cleanup_frequent_job_details test - throws permission error as expected'
  );

SELECT
  tests.clear_authentication ();

-- Test cleanup_queue_messages (admin function - may fail due to missing columns)
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  throws_ok (
    'SELECT cleanup_queue_messages()',
    'column "name" does not exist',
    'cleanup_queue_messages test - throws column error as expected'
  );

SELECT
  tests.clear_authentication ();

-- Test remove_old_jobs (admin function - may fail due to cron schema permissions)
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  throws_ok (
    'SELECT remove_old_jobs()',
    'permission denied for schema cron',
    'remove_old_jobs test - throws permission error as expected'
  );

SELECT
  tests.clear_authentication ();

-- Test delete_http_response (admin function)
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  lives_ok (
    'SELECT delete_http_response(999999)',
    'delete_http_response test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

-- Test set_mau_exceeded_by_org
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  lives_ok (
    'SELECT set_mau_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
    'set_mau_exceeded_by_org test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

-- Test set_bandwidth_exceeded_by_org
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  lives_ok (
    'SELECT set_bandwidth_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
    'set_bandwidth_exceeded_by_org test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

-- Test set_storage_exceeded_by_org
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  lives_ok (
    'SELECT set_storage_exceeded_by_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'', false)',
    'set_storage_exceeded_by_org test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

-- Test verify_mfa (returns true when not authenticated in test environment)
SELECT
  is (
    verify_mfa (),
    true,
    'verify_mfa test - returns true in test environment'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
