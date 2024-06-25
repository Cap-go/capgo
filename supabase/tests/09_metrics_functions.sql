-- 09_usage_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(6);

-- Test get_total_app_storage_size_orgs
SELECT results_eq(
    'SELECT get_total_app_storage_size_orgs(''046a36ac-e03c-4590-9257-bd6c9dba9ee8'', ''com.demo.app'')',
    $$VALUES (4050124::double precision)$$,
    'get_total_app_storage_size_orgs test - correct storage size'
);
SELECT results_eq(
    'SELECT get_total_app_storage_size_orgs(''11111111-1111-1111-1111-111111111111'', ''com.demo.app'')',
    $$VALUES (0::double precision)$$,
    'get_total_app_storage_size_orgs test - org does not exist'
);

-- Test get_total_storage_size_org
SELECT results_eq(
    'SELECT get_total_storage_size_org(''046a36ac-e03c-4590-9257-bd6c9dba9ee8'')',
    $$VALUES (4050124::double precision)$$,
    'get_total_storage_size_org test - correct storage size'
);
SELECT results_eq(
    'SELECT get_total_storage_size_org(''11111111-1111-1111-1111-111111111111'')',
    $$VALUES (0::double precision)$$,
    'get_total_storage_size_org test - org does not exist'
);

-- Test get_metered_usage
SELECT tests.authenticate_as('test_admin');
SELECT
    is((get_metered_usage('22dbad8a-b885-4309-9b3b-a09f8460fb6d')).mau >= 0, true, 'get_metered_usage test - non-negative mau');
SELECT
    is((get_metered_usage('22dbad8a-b885-4309-9b3b-a09f8460fb6d')).bandwidth >= 0, true, 'get_metered_usage test - non-negative bandwidth');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
