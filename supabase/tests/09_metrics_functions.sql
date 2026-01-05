-- 09_usage_functions.sql
BEGIN;


SELECT plan(7);

-- Test get_total_app_storage_size_orgs
SELECT
    results_eq(
        'SELECT get_total_app_storage_size_orgs(''046a36ac-e03c-4590-9257-bd6c9dba9ee8'', ''com.demo.app'')',
        $$VALUES (4050124::double precision)$$,
        'get_total_app_storage_size_orgs test - correct storage size'
    );

SELECT
    results_eq(
        'SELECT get_total_app_storage_size_orgs(''11111111-1111-1111-1111-111111111111'', ''com.demo.app'')',
        $$VALUES (0::double precision)$$,
        'get_total_app_storage_size_orgs test - org does not exist'
    );

-- Test get_total_app_storage_size_orgs negative cases
SELECT
    results_eq(
        'SELECT get_total_app_storage_size_orgs(''046a36ac-e03c-4590-9257-bd6c9dba9ee8'', ''non-existent-app'')',
        $$VALUES (0::double precision)$$,
        'get_total_app_storage_size_orgs test - app does not exist'
    );

SELECT
    results_eq(
        'SELECT get_total_app_storage_size_orgs(''00000000-0000-0000-0000-000000000000'', ''non-existent-app'')',
        $$VALUES (0::double precision)$$,
        'get_total_app_storage_size_orgs test - both org and app do not exist'
    );

-- Test get_total_storage_size_org
SELECT
    results_eq(
        'SELECT get_total_storage_size_org(''046a36ac-e03c-4590-9257-bd6c9dba9ee8'')',
        $$VALUES (4050124::double precision)$$,
        'get_total_storage_size_org test - correct storage size'
    );

SELECT
    results_eq(
        'SELECT get_total_storage_size_org(''11111111-1111-1111-1111-111111111111'')',
        $$VALUES (0::double precision)$$,
        'get_total_storage_size_org test - org does not exist'
    );

-- Test get_total_storage_size_org negative cases
SELECT
    results_eq(
        'SELECT get_total_storage_size_org(''00000000-0000-0000-0000-000000000000'')',
        $$VALUES (0::double precision)$$,
        'get_total_storage_size_org test - null org returns zero'
    );

SELECT *
FROM
    finish();

ROLLBACK;
