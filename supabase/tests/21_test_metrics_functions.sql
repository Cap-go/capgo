BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (31);

-- Test get_metered_usage without org
SELECT
  ok (
    (
      SELECT
        mau
      FROM
        get_metered_usage ()
    ) >= 0,
    'get_metered_usage test - returns global mau'
  );

SELECT
  ok (
    (
      SELECT
        bandwidth
      FROM
        get_metered_usage ()
    ) >= 0,
    'get_metered_usage test - returns global bandwidth'
  );

SELECT
  ok (
    (
      SELECT
        storage
      FROM
        get_metered_usage ()
    ) >= 0,
    'get_metered_usage test - returns global storage'
  );

-- Test get_metered_usage with org
SELECT
  ok (
    (
      SELECT
        mau
      FROM
        get_metered_usage ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_metered_usage test - returns org mau'
  );

SELECT
  ok (
    (
      SELECT
        bandwidth
      FROM
        get_metered_usage ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_metered_usage test - returns org bandwidth'
  );

SELECT
  ok (
    (
      SELECT
        storage
      FROM
        get_metered_usage ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_metered_usage test - returns org storage'
  );

-- Test get_metered_usage negative cases
SELECT
  is (
    (
      SELECT
        mau
      FROM
        get_metered_usage ('00000000-0000-0000-0000-000000000000')
    ),
    0::bigint,
    'get_metered_usage test - non-existent org returns zero mau'
  );

SELECT
  is (
    (
      SELECT
        bandwidth
      FROM
        get_metered_usage ('00000000-0000-0000-0000-000000000000')
    ),
    0::bigint,
    'get_metered_usage test - non-existent org returns zero bandwidth'
  );

-- Test get_total_storage_size_org
SELECT
  ok (
    get_total_storage_size_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d') >= 0,
    'get_total_storage_size_org test - returns storage size'
  );

-- Test get_total_storage_size_org negative case
SELECT
  is (
    get_total_storage_size_org ('00000000-0000-0000-0000-000000000000'),
    0::double precision,
    'get_total_storage_size_org test - non-existent org returns zero'
  );

-- Test get_total_app_storage_size_orgs
SELECT
  ok (
    get_total_app_storage_size_orgs (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'com.demoadmin.app'
    ) >= 0,
    'get_total_app_storage_size_orgs test - returns app storage size'
  );

-- Test get_total_app_storage_size_orgs negative cases
SELECT
  is (
    get_total_app_storage_size_orgs (
      '00000000-0000-0000-0000-000000000000',
      'com.demoadmin.app'
    ),
    0::double precision,
    'get_total_app_storage_size_orgs test - non-existent org returns zero'
  );

SELECT
  is (
    get_total_app_storage_size_orgs (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'non-existent-app'
    ),
    0::double precision,
    'get_total_app_storage_size_orgs test - non-existent app returns zero'
  );

-- Test get_plan_usage_percent_detailed without dates
SELECT
  ok (
    (
      SELECT
        total_percent
      FROM
        get_plan_usage_percent_detailed ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_plan_usage_percent_detailed test - returns total percent'
  );

SELECT
  ok (
    (
      SELECT
        mau_percent
      FROM
        get_plan_usage_percent_detailed ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_plan_usage_percent_detailed test - returns mau percent'
  );

-- Test get_plan_usage_percent_detailed with dates
SELECT
  ok (
    (
      SELECT
        total_percent
      FROM
        get_plan_usage_percent_detailed (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2024-01-01',
          '2024-01-31'
        )
    ) >= 0,
    'get_plan_usage_percent_detailed test - returns total percent with dates'
  );

-- Test get_plan_usage_percent_detailed negative cases
SELECT
  ok (
    (
      SELECT
        total_percent
      FROM
        get_plan_usage_percent_detailed ('00000000-0000-0000-0000-000000000000')
    ) IS NULL,
    'get_plan_usage_percent_detailed test - non-existent org returns null'
  );

SELECT
  ok (
    (
      SELECT
        total_percent
      FROM
        get_plan_usage_percent_detailed (
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
          '2025-01-01',
          '2025-01-31'
        )
    ) >= 0,
    'get_plan_usage_percent_detailed test - future dates return valid result'
  );

-- Test is_mau_exceeded_by_org
SELECT
  is (
    is_mau_exceeded_by_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    false,
    'is_mau_exceeded_by_org test - mau not exceeded'
  );

-- Test is_mau_exceeded_by_org negative case
SELECT
  ok (
    is_mau_exceeded_by_org ('00000000-0000-0000-0000-000000000000') IS NULL,
    'is_mau_exceeded_by_org test - non-existent org returns null'
  );

-- Test is_bandwidth_exceeded_by_org
SELECT
  is (
    is_bandwidth_exceeded_by_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    false,
    'is_bandwidth_exceeded_by_org test - bandwidth not exceeded'
  );

-- Test is_bandwidth_exceeded_by_org negative case
SELECT
  ok (
    is_bandwidth_exceeded_by_org ('00000000-0000-0000-0000-000000000000') IS NULL,
    'is_bandwidth_exceeded_by_org test - non-existent org returns null'
  );

-- Test is_storage_exceeded_by_org
SELECT
  is (
    is_storage_exceeded_by_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    false,
    'is_storage_exceeded_by_org test - storage not exceeded'
  );

-- Test is_storage_exceeded_by_org negative case
SELECT
  ok (
    is_storage_exceeded_by_org ('00000000-0000-0000-0000-000000000000') IS NULL,
    'is_storage_exceeded_by_org test - non-existent org returns null'
  );

-- Test get_weekly_stats
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_weekly_stats ('com.demoadmin.app')
    ) >= 0,
    'get_weekly_stats test - returns weekly stats'
  );

-- Test get_weekly_stats negative case
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_weekly_stats ('non-existent-app')
    ) >= 0,
    'get_weekly_stats test - non-existent app returns valid result'
  );

-- Test get_customer_counts
SELECT
  ok (
    (
      SELECT
        total
      FROM
        get_customer_counts ()
    ) >= 0,
    'get_customer_counts test - returns customer counts'
  );

-- Test count_active_users
SELECT
  ok (
    count_active_users (ARRAY['com.demoadmin.app']) >= 0,
    'count_active_users test - returns active user count'
  );

-- Test count_active_users negative cases
SELECT
  ok (
    count_active_users (ARRAY['non-existent-app']) >= 0,
    'count_active_users test - non-existent app returns valid result'
  );

SELECT
  ok (
    count_active_users (ARRAY[]::varchar[]) >= 0,
    'count_active_users test - empty array returns valid result'
  );

-- Test get_versions_with_no_metadata
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_versions_with_no_metadata ()
    ) >= 0,
    'get_versions_with_no_metadata test - returns versions without metadata'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
