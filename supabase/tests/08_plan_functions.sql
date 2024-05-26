-- 08_plan_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(16);

-- Test get_current_plan_max_org
SELECT results_eq(
    'SELECT (get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')).mau',
    $$VALUES (500::bigint)$$,
    'get_current_plan_max_org test - correct mau'
);
SELECT results_eq(
    'SELECT (get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')).bandwidth',
    $$VALUES (13958643712::bigint)$$,
    'get_current_plan_max_org test - correct bandwidth'
);
SELECT results_eq(
    'SELECT (get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')).storage',
    $$VALUES (1073741824::bigint)$$,
    'get_current_plan_max_org test - correct storage'
);

-- Test get_current_plan_name_org
SELECT is(get_current_plan_name_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), 'Solo', 'get_current_plan_name_org test - correct plan name');
SELECT is(get_current_plan_name_org('11111111-1111-1111-1111-111111111111'), NULL, 'get_current_plan_name_org test - org does not exist');

-- Test is_good_plan_v5_org
SELECT is(is_good_plan_v5_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_good_plan_v5_org test - plan is good');

-- Test find_best_plan_v3
-- Define variables to hold plan details
DO $$
DECLARE
    selected_plan_id uuid := '526e11d8-3c51-4581-ac92-4770c602f47c'; -- ID for Solo plan
    selected_plan_mau bigint;
    selected_plan_bandwidth double precision;
    selected_plan_storage double precision;
BEGIN
    -- Retrieve a suitable plan from the database by ID
    SELECT mau, bandwidth, storage INTO selected_plan_mau, selected_plan_bandwidth, selected_plan_storage
    FROM plans 
    WHERE id = selected_plan_id
    LIMIT 1;
    
    -- Perform the test using the retrieved plan values
    PERFORM is(
        find_best_plan_v3(selected_plan_mau, selected_plan_bandwidth, selected_plan_storage), 
        'Solo', 
        'find_best_plan_v3 test - fits Solo plan'
    );
END $$;

-- Define variables to hold details for another plan
DO $$
DECLARE
    selected_plan_id_2 uuid := 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'; -- ID for Team plan
    selected_plan_mau_2 bigint;
    selected_plan_bandwidth_2 double precision;
    selected_plan_storage_2 double precision;
BEGIN
    -- Retrieve another suitable plan from the database by ID
    SELECT mau, bandwidth, storage INTO selected_plan_mau_2, selected_plan_bandwidth_2, selected_plan_storage_2
    FROM plans 
    WHERE id = selected_plan_id_2
    LIMIT 1;
    
    -- Perform the test using the retrieved plan values
    PERFORM is(
        find_best_plan_v3(selected_plan_mau_2, selected_plan_bandwidth_2, selected_plan_storage_2), 
        'Team', 
        'find_best_plan_v3 test - fits Team plan'
    );
END $$;

SELECT * FROM finish();
ROLLBACK;
