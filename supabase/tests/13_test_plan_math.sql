BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(12);

CREATE OR REPLACE FUNCTION my_tests(
) RETURNS SETOF TEXT AS $$
DECLARE
  app_metrics RECORD;
  usage RECORD;
BEGIN
  -- Remove all storage info for everyone
  TRUNCATE TABLE "public"."app_versions_meta" CASCADE;
  TRUNCATE TABLE "public"."daily_mau" CASCADE;
  TRUNCATE TABLE "public"."daily_bandwidth" CASCADE;

  -- Set "solo" plan to test user
  UPDATE stripe_info set product_id='prod_LQIregjtNduh4q' where customer_id='cus_Q38uE91NP8Ufqc';

  -- solo has 1 gb of storage, fake a 0.3 gb bundle
  INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
  (now(), 'com.demo.app', now(), '3885ee49', convert_gb_to_bytes(0.3), 3, 10);

  INSERT INTO "public"."daily_mau" ("app_id", "mau", "date") VALUES 
  ('com.demo.app', 10, now()::date);

  INSERT INTO "public"."daily_bandwidth" ("app_id", "bandwidth", "date") VALUES 
  ('com.demo.app', convert_gb_to_bytes(0.13), now()::date);

  SELECT * FROM get_total_metrics ('046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid) INTO app_metrics;
  RETURN NEXT is(app_metrics.storage, convert_gb_to_bytes(0.3)::bigint, 'Get metrics storage = 0.3 gb');
  RETURN NEXT is(app_metrics.mau, 10::bigint, 'Get metrics mau = 10');
  RETURN NEXT is(app_metrics.bandwidth, convert_gb_to_bytes(0.13)::bigint, 'Get metrics bandwidth = 0.13 GB');

  -- Solo has 500 mau, 10 mau = 2%
  SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;
  RETURN NEXT IS(usage.storage_percent, (SELECT CAST ('30.0' AS DOUBLE PRECISION)), 'Storage usage = 30% for "Solo" plan');
  RETURN NEXT IS(usage.mau_percent, (SELECT CAST ('1.0' AS DOUBLE PRECISION)), 'Mau usage = 2% for "Solo" plan');
  RETURN NEXT IS(usage.bandwidth_percent, (SELECT CAST ('1.0' AS DOUBLE PRECISION)), 'Bandwidth usage = 1% for "Solo" plan');

  -- Let's now add a second app to this org. 
  ALTER TABLE app_versions DISABLE TRIGGER force_valid_owner_org_app_versions;

  UPDATE apps set owner_org='046a36ac-e03c-4590-9257-bd6c9dba9ee8' where app_id='com.demoadmin.app';

  UPDATE app_versions set app_id='com.demoadmin.app', r2_path='orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demoadmin.app/1.359.0.zip' where id=7;
  INSERT INTO "public"."daily_mau" ("app_id", "mau", "date") VALUES 
  ('com.demoadmin.app', 10, (now() - interval '1 day')::date);

  INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
  (now(), 'com.demoadmin.app', now(), '3885ee49', convert_gb_to_bytes(0.1), 7, 10);

  INSERT INTO "public"."daily_bandwidth" ("app_id", "bandwidth", "date") VALUES 
  ('com.demoadmin.app', convert_gb_to_bytes(0.13), now()::date);

  SELECT * FROM get_total_metrics ('046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid) INTO app_metrics;
  RETURN NEXT is(app_metrics.storage + 1, convert_gb_to_bytes(0.4)::bigint, 'Get metrics storage = 0.4 gb (2 apps)');
  RETURN NEXT is(app_metrics.mau, 20::bigint, 'Get metrics mau = 10 (2 apps)');
  RETURN NEXT is(app_metrics.bandwidth, convert_gb_to_bytes(0.26)::bigint, 'Get metrics bandwidth = 0.23 GB (2 apps)');

  SELECT * from get_plan_usage_percent_detailed('046a36ac-e03c-4590-9257-bd6c9dba9ee8') limit 1 into usage;
  RETURN NEXT IS(usage.storage_percent, (SELECT CAST ('40.0' AS DOUBLE PRECISION)), 'Storage usage = 40% for "Solo" plan (2 apps)');
  RETURN NEXT IS(usage.mau_percent, (SELECT CAST ('2.0' AS DOUBLE PRECISION)), 'Mau usage = 2% for "Solo" plan (2 apps)');
  RETURN NEXT IS(usage.bandwidth_percent, (SELECT CAST ('2.0' AS DOUBLE PRECISION)), 'Bandwidth usage = 2% for "Solo" plan (2 apps)');
END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;
