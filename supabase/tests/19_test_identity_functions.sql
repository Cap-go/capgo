BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(14);

-- Test get_identity without parameters
SELECT tests.authenticate_as('test_user');
SELECT is(get_identity(), tests.get_supabase_uid('test_user'), 'get_identity test - returns current user id');
SELECT tests.clear_authentication();

-- Test get_identity with keymode (this will throw error, so we test it differently)
SELECT throws_ok('SELECT get_identity(''{read}'')', 'get_identity called!', 'get_identity test - throws error without proper auth');

-- Test get_identity_apikey_only
SELECT is(get_identity_apikey_only('{all}'), null, 'get_identity_apikey_only test - returns null without apikey');

-- Test get_user_id with apikey
SELECT is(get_user_id('ae6e7458-c46d-4c00-aa3b-153b0b8520ea'), '6aa76066-55ef-4238-ade6-0b32334a4097', 'get_user_id test - valid apikey');
SELECT is(get_user_id('invalid-key'), null, 'get_user_id test - invalid apikey');

-- Test get_user_id with apikey and app_id (function doesn't validate app ownership for this)
SELECT is(get_user_id('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'com.demo.app'), '6aa76066-55ef-4238-ade6-0b32334a4097', 'get_user_id test - valid apikey returns user regardless of app');
SELECT is(get_user_id('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'invalid-app'), '6aa76066-55ef-4238-ade6-0b32334a4097', 'get_user_id test - valid apikey returns user even with invalid app');

-- Test is_allowed_action (requires proper app ownership)
SELECT is(is_allowed_action('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'com.demo.app'), false, 'is_allowed_action test - action not allowed without proper setup');
SELECT is(is_allowed_action('invalid-key', 'com.demo.app'), false, 'is_allowed_action test - invalid key');

-- Test is_app_owner variants
SELECT tests.authenticate_as('test_user');
SELECT is(is_app_owner('com.demo.app'), true, 'is_app_owner test - user owns app');
SELECT tests.clear_authentication();

SELECT is(is_app_owner('ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'com.demo.app'), true, 'is_app_owner test - apikey owns app');
SELECT is(is_app_owner('6aa76066-55ef-4238-ade6-0b32334a4097', 'com.demo.app'), false, 'is_app_owner test - userid check requires proper context');

-- Test has_app_right
SELECT tests.authenticate_as('test_user');
SELECT is(has_app_right('com.demo.app', 'read'), true, 'has_app_right test - user has read right');
SELECT tests.clear_authentication();

-- Test has_app_right_userid
SELECT is(has_app_right_userid('com.demo.app', 'read', '6aa76066-55ef-4238-ade6-0b32334a4097'), true, 'has_app_right_userid test - user has right');

SELECT * FROM finish();
ROLLBACK; 
