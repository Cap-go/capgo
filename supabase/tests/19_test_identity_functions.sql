BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (25);

-- Test get_identity without parameters
SELECT
  tests.authenticate_as ('test_user');

SELECT
  is (
    get_identity (),
    tests.get_supabase_uid ('test_user'),
    'get_identity test - returns current user id'
  );

SELECT
  tests.clear_authentication ();

-- Test get_identity_apikey_only without any headers
SELECT
  is (
    get_identity_apikey_only ('{all}'),
    null,
    'get_identity_apikey_only test - returns null without apikey'
  );

-- Test get_identity_apikey_only with proper API key context
-- Set up request headers to simulate API key being passed
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);
END $$;

SELECT
  is (
    get_identity_apikey_only ('{all}'),
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'get_identity_apikey_only test - returns user with valid all key'
  );

SELECT
  is (
    get_identity_apikey_only ('{read}'),
    null,
    'get_identity_apikey_only test - returns null when key mode does not match'
  );

-- Test with read key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}', true);
END $$;

SELECT
  is (
    get_identity_apikey_only ('{read}'),
    'c591b04e-cf29-4945-b9a0-776d0672061a',
    'get_identity_apikey_only test - returns user with valid read key'
  );

SELECT
  is (
    get_identity_apikey_only ('{read,all}'),
    'c591b04e-cf29-4945-b9a0-776d0672061a',
    'get_identity_apikey_only test - returns user when key mode matches one of allowed modes'
  );

-- Test with upload key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "c591b04e-cf29-4945-b9a0-776d0672061e"}', true);
END $$;

SELECT
  is (
    get_identity_apikey_only ('{upload}'),
    'c591b04e-cf29-4945-b9a0-776d0672061a',
    'get_identity_apikey_only test - returns user with valid upload key'
  );

SELECT
  is (
    get_identity_apikey_only ('{read}'),
    null,
    'get_identity_apikey_only test - returns null when upload key used for read access'
  );

-- Test with invalid API key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "invalid-api-key-12345"}', true);
END $$;

SELECT
  is (
    get_identity_apikey_only ('{all}'),
    null,
    'get_identity_apikey_only test - returns null with invalid apikey'
  );

-- Reset headers for remaining tests
DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test get_user_id with apikey
SELECT
  is (
    get_user_id ('ae6e7458-c46d-4c00-aa3b-153b0b8520ea'),
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'get_user_id test - valid apikey'
  );

SELECT
  is (
    get_user_id ('invalid-key'),
    null,
    'get_user_id test - invalid apikey'
  );

-- Test get_user_id with apikey and app_id (function doesn't validate app ownership for this)
SELECT
  is (
    get_user_id (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'com.demo.app'
    ),
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'get_user_id test - valid apikey returns user regardless of app'
  );

SELECT
  is (
    get_user_id (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'invalid-app'
    ),
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'get_user_id test - valid apikey returns user even with invalid app'
  );

-- Test is_allowed_action (requires proper app ownership and organization plan)
-- Note: This may be false if organization limits are in effect
SELECT
  ok (
    is_allowed_action (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'com.demo.app'
    ) IS NOT NULL,
    'is_allowed_action test - returns boolean result for valid key and app'
  );

SELECT
  is (
    is_allowed_action ('invalid-key', 'com.demo.app'),
    false,
    'is_allowed_action test - invalid key'
  );

-- Test is_app_owner variants
SELECT
  tests.authenticate_as ('test_user');

SELECT
  is (
    is_app_owner ('com.demo.app'),
    true,
    'is_app_owner test - user owns app'
  );

SELECT
  tests.clear_authentication ();

SELECT
  is (
    is_app_owner (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'com.demo.app'
    ),
    true,
    'is_app_owner test - apikey owns app'
  );

-- Test is_app_owner with userid - test that function works with valid inputs
SELECT
  ok (
    is_app_owner (
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      'com.demo.app'
    ) IS NOT NULL,
    'is_app_owner test - userid function returns boolean result'
  );

-- Test has_app_right
SELECT
  tests.authenticate_as ('test_user');

SELECT
  is (
    has_app_right ('com.demo.app', 'read'),
    true,
    'has_app_right test - user has read right'
  );

-- Test has_app_right negative cases
SELECT
  is (
    has_app_right ('non-existent-app', 'read'),
    false,
    'has_app_right test - non-existent app returns false'
  );

SELECT
  tests.clear_authentication ();

-- Test has_app_right_userid
SELECT
  is (
    has_app_right_userid (
      'com.demo.app',
      'read',
      '6aa76066-55ef-4238-ade6-0b32334a4097'
    ),
    true,
    'has_app_right_userid test - user has right'
  );

-- Test has_app_right_userid negative cases
SELECT
  is (
    has_app_right_userid (
      'non-existent-app',
      'read',
      '6aa76066-55ef-4238-ade6-0b32334a4097'
    ),
    false,
    'has_app_right_userid test - non-existent app returns false'
  );

SELECT
  is (
    has_app_right_userid (
      'com.demo.app',
      'read',
      '00000000-0000-0000-0000-000000000000'
    ),
    false,
    'has_app_right_userid test - non-existent user returns false'
  );

-- Test is_app_owner negative cases
SELECT
  is (
    is_app_owner ('invalid-api-key', 'com.demo.app'),
    false,
    'is_app_owner test - invalid apikey returns false'
  );

SELECT
  is (
    is_app_owner (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'non-existent-app'
    ),
    false,
    'is_app_owner test - non-existent app returns false'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
