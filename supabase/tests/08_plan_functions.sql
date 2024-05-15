BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(5);

-- Test get_current_plan_name_org
SELECT is(get_current_plan_name_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), 'Solo', 'get_current_plan_name_org test - correct plan name');
SELECT is(get_current_plan_name_org('22dbad8a-b885-4309-9b3b-a09f8460fb6c'), NULL, 'get_current_plan_name_org test - org does not exist');

-- Test get_current_plan_max_org
SELECT function_returns('get_current_plan_max_org', ARRAY['uuid'], 'setof record');
SELECT results_eq(
    'SELECT (get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6d'')).*',
    $$VALUES (500::bigint, 13958643712::bigint, 1073741824::bigint)$$,
    'get_current_plan_max_org test - correct plan maximums'
);
SELECT is_empty(
    'SELECT * FROM get_current_plan_max_org(''22dbad8a-b885-4309-9b3b-a09f8460fb6e'')',
    'get_current_plan_max_org test - org does not exist'
);

SELECT * FROM finish();
ROLLBACK;
