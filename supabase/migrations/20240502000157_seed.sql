DROP TABLE app_usage;

CREATE OR REPLACE FUNCTION reset_and_seed_data()
RETURNS void AS $$
BEGIN
    -- Truncate tables
    TRUNCATE TABLE "auth"."users" CASCADE;
    TRUNCATE TABLE "public"."plans" CASCADE;
    TRUNCATE TABLE "storage"."buckets" CASCADE;
    TRUNCATE TABLE "public"."stripe_info" CASCADE;
    TRUNCATE TABLE "public"."users" CASCADE;
    TRUNCATE TABLE "public"."orgs" CASCADE;
    TRUNCATE TABLE "public"."apikeys" CASCADE;
    TRUNCATE TABLE "public"."apps" CASCADE;
    TRUNCATE TABLE "public"."app_versions" CASCADE;
    TRUNCATE TABLE "public"."app_versions_meta" CASCADE;
    TRUNCATE TABLE "public"."channels" CASCADE;

    -- Insert seed data
    -- (Include all your INSERT statements here)

    -- Seed data
    INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
    ('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', now(), now(), 'oljikwwipqrkwilfsyto', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsyty', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsytt', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

    INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "version", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "storage_unit", "bandwidth_unit", "mau_unit", "price_m_storage_id", "price_m_bandwidth_id", "price_m_mau_id") VALUES
    ('2022-05-31 10:59:55+00', '2023-02-18 17:03:23.973973+00', 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIs1Yucml9ChU', 100, '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_1KjSGyGH46eYKnWwL4h14DsK', 'price_1KjSKIGH46eYKnWwFG9u4tNi', 3, 250, 5000, 'Best for small business owners', 0, 0, 0, NULL, NULL, NULL),
    ('2022-08-24 16:07:00+00', '2023-02-18 17:07:39.265733+00', 'Pay as you go', 'plan.payasyougo.desc', 499, 4799, 'prod_MH5Jh6ajC9e7ZH', 1000, '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LYX8yGH46eYKnWwzeBjISvW', 'price_1LYX8yGH46eYKnWwzeBjISvW', 12, 3000, 40000, 'Best for scalling enterprises', 0.5, 0.9, 0.0006, 'price_1LYXD8GH46eYKnWwaVvggvyy', 'price_1LYXDoGH46eYKnWwPEYVZXui', 'price_1LYXE2GH46eYKnWwo5qd4BTU'),
    ('2022-05-31 10:58:34+00', '2022-05-31 10:58:34+00', 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIregjtNduh4q', 10, '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1LVvuZGH46eYKnWwuGKOf4DK', 'price_1LVvuIGH46eYKnWwHMDCrxcH', 1073741824, 13958643712, 500, 'Best for independent developers', 0, 0, 0, NULL, NULL, NULL),
    ('2022-05-31 11:01:56+00', '2022-10-04 16:03:29.836516+00', 'Team', 'plan.team.desc', 99, 998, 'prod_LQIugvJcPrxhda', 1000, 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSIUGH46eYKnWwWHvg8XYs', 'price_1KjSLlGH46eYKnWwAwMW2wiW', 6, 500, 10000, 'Best for medium enterprises', 0, 0, 0, NULL, NULL, NULL);

    INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
    ('apps', 'apps', NULL, '2021-12-27 23:51:01.568349+00', '2021-12-27 23:51:01.568349+00', 'f'),
    ('images', 'images', NULL, '2021-12-27 23:50:34.743465+00', '2021-12-27 23:50:34.743465+00', 't');

    INSERT INTO "public"."stripe_info" ("created_at", "updated_at", "subscription_id", "customer_id", "status", "product_id", "trial_at", "price_id", "is_good_plan", "plan_usage", "subscription_metered", "subscription_anchor_start", "subscription_anchor_end") VALUES
    (now(), '2023-03-21 03:04:42.120379+00', 'sub_1', 'cus_Pa0k8TO6HVln6A', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), '2023-03-21 03:04:42.120379+00', 'sub_2', 'cus_Q38uE91NP8Ufqc', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), '2023-03-21 03:04:42.120379+00', 'sub_3', 'cus_Pa0f3M6UCQ8g5Q', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days');

    -- Do not insert new orgs
    ALTER TABLE users DISABLE TRIGGER generate_org_on_user_create;
    INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enableNotifications", "optForNewsletters", "legalAccepted", "customer_id", "billing_email") VALUES
    ('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', NULL, NULL);
    ALTER TABLE users ENABLE TRIGGER generate_org_on_user_create;

    INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name", "management_email", "customer_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Admin org', 'admin@capgo.app', 'cus_Pa0k8TO6HVln6A'),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Demo org', 'test@capgo.app', 'cus_Q38uE91NP8Ufqc'),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Test2 org', 'test2@capgo.app', 'cus_Pa0f3M6UCQ8g5Q');

    INSERT INTO "public"."org_users" ("org_id", "user_id", "user_right", "app_id", "channel_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'super_admin'::"user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"user_min_right", null, null),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'super_admin'::"user_min_right", null, null);

    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at") VALUES
    (911, '2022-07-12 12:06:18.822406+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'upload', '2022-07-12 12:06:18.822406+00'),
    (912, '2022-07-12 12:06:22.425878+00', '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', '2022-07-12 12:06:22.425878+00'),
    (913, '2022-07-12 12:06:36.468855+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', '2022-07-12 12:06:36.468855+00'),
    (916, '2022-07-12 12:06:36.468855+00', '6aa76066-55ef-4238-ade6-0b32334a4097', '985640ce-4031-4cfd-8095-d1d1066b6b3b', 'write', '2022-07-12 12:06:36.468855+00'),
    (914, '2022-07-12 12:06:36.468855+00', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85', 'all', '2022-07-12 12:06:36.468855+00'),
    (915, '2022-07-12 12:06:36.468855+00', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', 'upload', '2022-07-12 12:06:36.468855+00');

    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "tmp_id", "owner_org", "user_id") VALUES
    ('2022-03-07 14:08:28.910887+00', 'com.demoadmin.app', '', 'Demo Admin app', '1.0.0', '2023-03-20 00:46:33.006797+00', 'f8b37304-0fb8-48b2-9ef8-ff3d7c50a792', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a'),
    ('2022-03-07 14:08:28.910887+00', 'com.demo.app', '', 'Demo app', '1.0.0', '2023-03-20 00:46:33.006797+00', 'f8b37304-0fb8-48b2-9ef8-ff3d7c50a792', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097');

    INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider", "owner_org") VALUES
    (9655, now(), 'com.demo.app', '1.0.1', 'test-bucket.zip', now(), 'f', NULL, '', NULL, 'r2-direct', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9654, now(), 'com.demo.app', '1.0.0', '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9.zip', now(), 'f', NULL, '3885ee49', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9653, now(), 'com.demo.app', '1.361.0', '3dfe0df9-94fa-4ae8-b538-3f1a9b305687.zip', now(), 'f', NULL, '9d4f798a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9652, now(), 'com.demo.app', '1.360.0', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85.zip', now(), 'f', NULL, '44913a9f', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9601, now(), 'com.demo.app', '1.359.0', '8aafd924-bd31-43be-8f35-3f6957890ff9.zip', now(), 'f', NULL, '9f74e70a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (1884, now(), 'com.demo.app', 'builtin', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (1883, now(), 'com.demo.app', 'unknown', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8');

    INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
    (now(), 'com.demo.app', '2023-03-20 00:46:33.664139+00', '', 0, 9655, 10),
    (now(), 'com.demo.app', '2023-03-20 00:46:33.664139+00', '3885ee49', 1012506, 9654, 10),
    (now(), 'com.demo.app', '2023-03-20 00:33:16.912242+00', '9d4f798a', 1012529, 9653, 20),
    (now(), 'com.demo.app', '2023-03-20 00:29:35.189367+00', '44913a9f', 1012541, 9652, 30),
    (now(), 'com.demo.app', '2023-03-16 16:28:44.815867+00', '9f74e70a', 1012548, 9601, 40);

    INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "updated_at", "public", "disableAutoUpdateUnderNative", "disableAutoUpdate", "beta", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev") VALUES
    (22, now(), 'production', 'com.demo.app', 9654, '2023-02-28 10:50:58.246133+00', 't', 't', 'major'::"public"."disable_update", 'f', 'f', 't', 't', 't', 't'),
    (23, now(), 'no_access', 'com.demo.app', 9653, '2023-02-28 10:50:58.246133+00', 'f', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't'),
    (24, now(), 'two_default', 'com.demo.app', 9654, '2023-02-28 10:50:58.246133+00', 't', 't', 'major'::"public"."disable_update", 'f', 't', 'f', 't', 't', 't');

    -- Drop replicated orgs but keet the the seed ones
    DELETE from "orgs" where POSITION('organization' in orgs.name)=1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reset_and_seed_stats_data() RETURNS void AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_file_size BIGINT;
  random_uuid UUID;
  random_version_id BIGINT := 9654;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
BEGIN
  -- Truncate all tables
  TRUNCATE TABLE daily_mau, daily_bandwidth, daily_storage, daily_version, storage_usage, version_usage, device_usage, bandwidth_usage, devices, stats;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  INSERT INTO devices (created_at, updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), '2023-01-29 08:09:32.324+00', random_uuid, random_version_id, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  INSERT INTO stats (created_at, platform, action, device_id, version_build, version, app_id) VALUES
    (now(), 'android', 'get', random_uuid, '1.223.0', random_version_id, 'com.demo.app'),
    (now(), 'android', 'get', random_uuid, '1.223.0', random_version_id, 'com.demo.app'),
    (now(), 'android', 'get', random_uuid, '1.223.0', random_version_id, 'com.demo.app'),
    (now(), 'android', 'get', random_uuid, '1.223.0', random_version_id, 'com.demo.app');

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    
    INSERT INTO daily_mau (app_id, date, mau) VALUES ('com.demo.app', curr_date, random_mau);
    INSERT INTO daily_bandwidth (app_id, date, bandwidth) VALUES ('com.demo.app', curr_date, random_bandwidth);
    INSERT INTO daily_storage (app_id, date, storage) VALUES ('com.demo.app', curr_date, random_storage);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for daily_version
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
    VALUES (curr_date, 'com.demo.app', random_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO storage_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, 'com.demo.app', random_version_id, random_action);
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO device_usage (device_id, app_id) VALUES (random_uuid, 'com.demo.app');
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.reset_and_seed_stats_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_and_seed_stats_data() FROM public;
REVOKE EXECUTE ON FUNCTION public.reset_and_seed_stats_data() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_and_seed_stats_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_and_seed_stats_data() TO postgres;
GRANT EXECUTE ON FUNCTION public.reset_and_seed_stats_data() TO service_role;

CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) 
RETURNS double precision
LANGUAGE "plpgsql"
AS $$
BEGIN
  IF max_val = 0 THEN
    RETURN 0;
  ELSE
    RETURN round(((val * 100) / max_val)::numeric, 2);
  END IF;
END;
$$;
