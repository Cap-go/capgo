-- 08_plan_functions.sql
BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

-- + 2 is for the count(*)
-- -1 is for the pay as you go if statenent
SELECT plan(((SELECT count(*) FROM plans)::integer * 13) + 2 - 2);

CREATE OR REPLACE FUNCTION my_tests(
) RETURNS SETOF text AS $$
DECLARE
  plan RECORD;
  usage RECORD;
  total_metrics RECORD;
  mau_count bigint;
  bandwidth_count bigint;
BEGIN

  select count(*) from daily_mau where app_id='com.demo.app' into mau_count;
  RETURN NEXT ok(mau_count > 0, 'Demo app mau is > 0');

  select count(*) from daily_bandwidth where app_id='com.demo.app' into bandwidth_count;
  RETURN NEXT ok(bandwidth_count > 0, 'Demo app bandwith is > 0');

  -- raise notice '%', mau_count;

  FOR plan IN
    SELECT * FROM plans
  LOOP
    -- Force demo app to have the given plan
    UPDATE stripe_info set product_id=plan.stripe_id where customer_id='cus_Q38uE91NP8Ufqc';
    UPDATE daily_mau set mau=floor((plan.mau - 1) / mau_count) where app_id='com.demo.app'; 
    UPDATE daily_bandwidth set bandwidth=floor((plan.bandwidth - convert_gb_to_bytes(0.5)) / bandwidth_count) where app_id='com.demo.app'; 

    SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;

    RETURN NEXT ok(usage.mau_percent < 100, format('Plan usage MAU is less than the limit for "%s" plan', plan.name));
    RETURN NEXT ok(usage.bandwidth_percent < 100, format('Plan usage BANDWIDTH is less than the limit for "%s" plan', plan.name));

    -- here we don't set storage but we do check it because we have to make sure is_good_plan will not fail due to storage
    RETURN NEXT ok(usage.storage_percent < 100, format('Plan usage STORAGE is less than the limit for "%s" plan', plan.name));

    SELECT * from get_total_metrics('046a36ac-e03c-4590-9257-bd6c9dba9ee8') INTO total_metrics;
    RETURN NEXT ok(total_metrics.mau > 0, format('Org total_metrics.mau > 0 for "%s" plan', plan.name));
    RETURN NEXT ok(total_metrics.bandwidth > 0, format('Org total_metrics.bandwidth > 0 for "%s" plan', plan.name));

    RETURN NEXT ok(
      (select * from find_fit_plan_v3(
        total_metrics.mau, 
        total_metrics.bandwidth, 
        total_metrics.storage) limit 1
      ) = plan.name, 
      format('find_fit_plan_v3 = "%s" plan', plan.name)
    );

    RETURN NEXT ok(is_good_plan_v5_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'), format('is_good_plan_v5_org for "%s" plan', plan.name));

    --
    --  Now let's make sure that the user is over the limit
    --
    UPDATE daily_mau set mau=floor((plan.mau - 1) / mau_count) * 1.5 where app_id='com.demo.app'; 
    UPDATE daily_bandwidth set bandwidth=floor((plan.bandwidth - convert_gb_to_bytes(0.5)) / bandwidth_count) * 1.5 where app_id='com.demo.app'; 
    
    SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;

    RETURN NEXT ok(usage.mau_percent > 100, format('Plan usage MAU is more than the limit for "%s" plan', plan.name));
    RETURN NEXT ok(usage.bandwidth_percent > 100, format('Plan usage BANDWIDTH is more than the limit for "%s" plan', plan.name));

    SELECT * from get_total_metrics('046a36ac-e03c-4590-9257-bd6c9dba9ee8') INTO total_metrics;
    RETURN NEXT ok(total_metrics.mau > 0, format('Org total_metrics.mau > 0 for "%s" plan', plan.name));
    RETURN NEXT ok(total_metrics.bandwidth > 0, format('Org total_metrics.bandwidth > 0 for "%s" plan', plan.name));

    -- TODO test those fns for pay as you go
    IF plan.name IS DISTINCT FROM 'Pay as you go' THEN
      RETURN NEXT ok(
        (select * from find_fit_plan_v3(
          total_metrics.mau, 
          total_metrics.bandwidth, 
          total_metrics.storage) limit 1
        ) != plan.name, 
        format('find_fit_plan_v3 NOT EQUAL "%s" plan', plan.name)
      );

      RETURN NEXT ok(is_good_plan_v5_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8') = false, format('is_good_plan_v5_org (NOT GOOD PLAN) for "%s" plan', plan.name));
    END IF;
  END LOOP;  
END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;
