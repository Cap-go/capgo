-- 10_utility_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(6);

-- Test get_user_id
SELECT results_eq(
    'SELECT get_user_id(''ae6e7458-c46d-4c00-aa3b-153b0b8520ea'')',
    $$VALUES ('6aa76066-55ef-4238-ade6-0b32334a4097'::uuid)$$,
    'get_user_id test - correct user ID'
);
SELECT results_eq(
    'SELECT get_user_id(''non_existent_key'')',
    $$VALUES (NULL::uuid)$$,
    'get_user_id test - key does not exist'
);

-- Test get_org_owner_id with app_id
SELECT results_eq(
    'SELECT get_org_owner_id(''ae6e7458-c46d-4c00-aa3b-153b0b8520eb'', ''com.demoadmin.app'')',
    $$VALUES ('c591b04e-cf29-4945-b9a0-776d0672061a'::uuid)$$,
    'get_org_owner_id test with app_id - correct user ID'
);
SELECT throws_ok(
    'SELECT get_org_owner_id(''ae6e7458-c46d-4c00-aa3b-153b0b8520bb'', ''com.demoadmin.app'')',
    'NO_RIGHTS',
    'get_org_owner_id test with app_id - user does not have rights'
);
-- Test get_user_main_org_id_by_app_id
SELECT results_eq(
    'SELECT get_user_main_org_id_by_app_id(''com.demoadmin.app'')',
    $$VALUES ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'::uuid)$$,
    'get_user_main_org_id_by_app_id test - correct org ID'
);
SELECT results_eq(
    'SELECT get_user_main_org_id_by_app_id(''non_existent_app'')',
    $$VALUES (NULL::uuid)$$,
    'get_user_main_org_id_by_app_id test - app does not exist'
);

SELECT * FROM finish();
ROLLBACK;
