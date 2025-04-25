-- 08_plan_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(8);

-- Test get_current_plan_max_org
SELECT results_eq(
    'SELECT (get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')).mau',
    $$VALUES (1000::bigint)$$,
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
SELECT is(is_good_plan_v5_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), TRUE, 'is_good_plan_v5_org test - plan is good');

-- Test find_best_plan_v3

-- Retrieve Solo plan details and perform the test
SELECT is(
    find_best_plan_v3(
        (
            SELECT mau
            FROM plans
            WHERE id = '526e11d8-3c51-4581-ac92-4770c602f47c'
        ),
        (
            SELECT bandwidth
            FROM plans
            WHERE id = '526e11d8-3c51-4581-ac92-4770c602f47c'
        ),
        (
            SELECT storage
            FROM plans
            WHERE id = '526e11d8-3c51-4581-ac92-4770c602f47c'
        )
    ),
    'Solo',
    'find_best_plan_v3 test - fits Solo plan'
);

-- Retrieve Team plan details and perform the test
SELECT is(
    find_best_plan_v3(
        (
            SELECT mau
            FROM plans
            WHERE id = 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'
        ),
        (
            SELECT bandwidth
            FROM plans
            WHERE id = 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'
        ),
        (
            SELECT storage
            FROM plans
            WHERE id = 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'
        )
    ),
    'Team',
    'find_best_plan_v3 test - fits Team plan'
);

SELECT * FROM finish();
ROLLBACK;
