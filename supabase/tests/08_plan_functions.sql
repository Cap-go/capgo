-- 08_plan_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(6);

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

SELECT * FROM finish();
ROLLBACK;
