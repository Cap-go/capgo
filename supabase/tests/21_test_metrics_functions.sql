BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(18);

-- Test get_metered_usage without org
SELECT ok((SELECT mau FROM get_metered_usage()) >= 0, 'get_metered_usage test - returns global mau');
SELECT ok((SELECT bandwidth FROM get_metered_usage()) >= 0, 'get_metered_usage test - returns global bandwidth');
SELECT ok((SELECT storage FROM get_metered_usage()) >= 0, 'get_metered_usage test - returns global storage');

-- Test get_metered_usage with org
SELECT ok((SELECT mau FROM get_metered_usage('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_metered_usage test - returns org mau');
SELECT ok((SELECT bandwidth FROM get_metered_usage('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_metered_usage test - returns org bandwidth');
SELECT ok((SELECT storage FROM get_metered_usage('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_metered_usage test - returns org storage');

-- Test get_total_storage_size_org
SELECT ok(get_total_storage_size_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d') >= 0, 'get_total_storage_size_org test - returns storage size');

-- Test get_total_app_storage_size_orgs
SELECT ok(get_total_app_storage_size_orgs('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'com.demoadmin.app') >= 0, 'get_total_app_storage_size_orgs test - returns app storage size');

-- Test get_plan_usage_percent_detailed without dates
SELECT ok((SELECT total_percent FROM get_plan_usage_percent_detailed('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_plan_usage_percent_detailed test - returns total percent');
SELECT ok((SELECT mau_percent FROM get_plan_usage_percent_detailed('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_plan_usage_percent_detailed test - returns mau percent');

-- Test get_plan_usage_percent_detailed with dates
SELECT ok((SELECT total_percent FROM get_plan_usage_percent_detailed('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '2024-01-01', '2024-01-31')) >= 0, 'get_plan_usage_percent_detailed test - returns total percent with dates');

-- Test is_mau_exceeded_by_org
SELECT is(is_mau_exceeded_by_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_mau_exceeded_by_org test - mau not exceeded');

-- Test is_bandwidth_exceeded_by_org
SELECT is(is_bandwidth_exceeded_by_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_bandwidth_exceeded_by_org test - bandwidth not exceeded');

-- Test is_storage_exceeded_by_org
SELECT is(is_storage_exceeded_by_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_storage_exceeded_by_org test - storage not exceeded');

-- Test get_weekly_stats
SELECT ok((SELECT COUNT(*) FROM get_weekly_stats('com.demoadmin.app')) >= 0, 'get_weekly_stats test - returns weekly stats');

-- Test get_customer_counts
SELECT ok((SELECT total FROM get_customer_counts()) >= 0, 'get_customer_counts test - returns customer counts');

-- Test count_active_users
SELECT ok(count_active_users(ARRAY['com.demoadmin.app']) >= 0, 'count_active_users test - returns active user count');

-- Test get_versions_with_no_metadata
SELECT ok((SELECT COUNT(*) FROM get_versions_with_no_metadata()) >= 0, 'get_versions_with_no_metadata test - returns versions without metadata');

SELECT * FROM finish();
ROLLBACK; 
