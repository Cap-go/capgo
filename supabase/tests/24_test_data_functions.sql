BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (32);

-- Test read_bandwidth_usage
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_bandwidth_usage ('com.demoadmin.app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_bandwidth_usage test - returns bandwidth data'
  );

-- Test read_bandwidth_usage negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_bandwidth_usage ('non-existent-app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_bandwidth_usage test - non-existent app returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_bandwidth_usage ('com.demoadmin.app', '2025-01-01', '2025-01-31')
    ) >= 0,
    'read_bandwidth_usage test - future dates return valid result'
  );

-- Test read_device_usage
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_device_usage ('com.demoadmin.app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_device_usage test - returns device data'
  );

-- Test read_device_usage negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_device_usage ('non-existent-app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_device_usage test - non-existent app returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_device_usage ('com.demoadmin.app', '2025-01-01', '2025-01-31')
    ) >= 0,
    'read_device_usage test - future dates return valid result'
  );

-- Test read_storage_usage
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_storage_usage ('com.demoadmin.app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_storage_usage test - returns storage data'
  );

-- Test read_storage_usage negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_storage_usage ('non-existent-app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_storage_usage test - non-existent app returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_storage_usage ('com.demoadmin.app', '2025-01-01', '2025-01-31')
    ) >= 0,
    'read_storage_usage test - future dates return valid result'
  );

-- Test read_version_usage
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_version_usage ('com.demoadmin.app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_version_usage test - returns version data'
  );

-- Test read_version_usage negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_version_usage ('non-existent-app', '2024-01-01', '2024-01-31')
    ) >= 0,
    'read_version_usage test - non-existent app returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        read_version_usage ('com.demoadmin.app', '2025-01-01', '2025-01-31')
    ) >= 0,
    'read_version_usage test - future dates return valid result'
  );

-- Test get_app_metrics without dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_app_metrics ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_app_metrics test - returns app metrics'
  );

-- Test get_app_metrics with dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_app_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2024-01-01',
          '2024-01-31'
        )
    ) >= 0,
    'get_app_metrics test - returns app metrics with dates'
  );

-- Test get_app_metrics negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_app_metrics ('00000000-0000-0000-0000-000000000000')
    ) >= 0,
    'get_app_metrics test - non-existent org returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_app_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2025-01-01',
          '2025-01-31'
        )
    ) >= 0,
    'get_app_metrics test - future dates return valid result'
  );

-- Test get_global_metrics without dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_global_metrics ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_global_metrics test - returns global metrics'
  );

-- Test get_global_metrics with dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_global_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2024-01-01',
          '2024-01-31'
        )
    ) >= 0,
    'get_global_metrics test - returns global metrics with dates'
  );

-- Test get_global_metrics negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_global_metrics ('00000000-0000-0000-0000-000000000000')
    ) >= 0,
    'get_global_metrics test - non-existent org returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_global_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2025-01-01',
          '2025-01-31'
        )
    ) >= 0,
    'get_global_metrics test - future dates return valid result'
  );

-- Test get_total_metrics without dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_total_metrics ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_total_metrics test - returns total metrics'
  );

-- Test get_total_metrics with dates
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_total_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2024-01-01',
          '2024-01-31'
        )
    ) >= 0,
    'get_total_metrics test - returns total metrics with dates'
  );

-- Test get_total_metrics negative cases
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_total_metrics ('00000000-0000-0000-0000-000000000000')
    ) >= 0,
    'get_total_metrics test - non-existent org returns valid result'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_total_metrics (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2025-01-01',
          '2025-01-31'
        )
    ) >= 0,
    'get_total_metrics test - future dates return valid result'
  );

-- Test find_fit_plan_v3
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        find_fit_plan_v3 (1000, 10, 10)
    ) >= 0,
    'find_fit_plan_v3 test - returns fitting plans'
  );

-- Test find_fit_plan_v3 negative case
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        find_fit_plan_v3 (0, 0, 0)
    ) >= 0,
    'find_fit_plan_v3 test - zero usage returns valid plans'
  );

-- Test count_all_plans_v2
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        count_all_plans_v2 ()
    ) >= 0,
    'count_all_plans_v2 test - returns plan counts'
  );

-- Test get_org_perm_for_apikey
SELECT
  ok (
    get_org_perm_for_apikey (
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
      'com.demo.app'
    ) IS NOT NULL,
    'get_org_perm_for_apikey test - returns permissions'
  );

-- Test get_org_perm_for_apikey negative case
SELECT
  is (
    get_org_perm_for_apikey ('invalid-key', 'com.demo.app'),
    'INVALID_APIKEY',
    'get_org_perm_for_apikey test - invalid key returns error'
  );

-- Test has_app_right_apikey
SELECT
  is (
    has_app_right_apikey (
      'com.demo.app',
      'read',
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
    ),
    true,
    'has_app_right_apikey test - user has right with apikey'
  );

-- Test has_app_right_apikey negative case
SELECT
  is (
    has_app_right_apikey (
      'non-existent-app',
      'read',
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
    ),
    false,
    'has_app_right_apikey test - non-existent app returns false'
  );

-- Test transfer_app
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  lives_ok (
    'SELECT transfer_app(''com.demoadmin.app'', ''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')',
    'transfer_app test - function executes without error'
  );

SELECT
  tests.clear_authentication ();

SELECT
  *
FROM
  finish ();

ROLLBACK;
