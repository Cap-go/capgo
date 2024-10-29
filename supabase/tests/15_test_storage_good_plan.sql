BEGIN;
-- CREATE EXTENSION "basejump-supabase_test_helpers";

-- + 2 is for the count(*)
-- -1 is for the pay as you go if statenent
SELECT plan(16);

CREATE OR REPLACE FUNCTION my_tests(
) RETURNS SETOF TEXT AS $$
DECLARE
  plan RECORD;
  usage RECORD;
BEGIN
  -- Remove all storage info for everyone
  TRUNCATE TABLE "public"."daily_mau" CASCADE;
  TRUNCATE TABLE "public"."daily_bandwidth" CASCADE;

  FOR plan IN
    SELECT * FROM plans
  LOOP
    TRUNCATE TABLE "public"."app_versions_meta" CASCADE;

    -- Force demo app to have the given plan
    UPDATE stripe_info set product_id=plan.stripe_id where customer_id='cus_Q38uE91NP8Ufqc';

    -- let's devide the plan storage by half and put it. 
    INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
    (now(), 'com.demo.app', now(), '3885ee49', FLOOR(plan.storage / 2), 3, 10);

    SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;
    RETURN NEXT IS(usage.storage_percent, (SELECT CAST ('50' AS DOUBLE PRECISION)), format('Storage usage = 50%% for "%s" plan', plan.name));
    RETURN NEXT ok(is_good_plan_v5_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'), format('is_good_plan_v5_org for "%s" plan', plan.name));

    -- let's now set the storage to 200% and see if it's blocked
    TRUNCATE TABLE "public"."app_versions_meta" CASCADE;
    INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
    (now(), 'com.demo.app', now(), '3885ee49', FLOOR(plan.storage * 2), 3, 10);

    SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;
    -- raise notice '%s %s', plan.name, usage;
    RETURN NEXT IS(usage.storage_percent, (SELECT CAST ('200' AS DOUBLE PRECISION)), format('Storage usage = 200%% for "%s" plan', plan.name));

    IF plan.name IS DISTINCT FROM 'Pay as you go' THEN
      RETURN NEXT ok(is_good_plan_v5_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8') = false, format('(NOT) is_good_plan_v5_org for "%s" plan', plan.name));
    ELSE
      RETURN NEXT ok(is_good_plan_v5_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'), 'Is good plan for "pay as you go" even after storage is > 100%');
    END IF;
  END LOOP;  
END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;
