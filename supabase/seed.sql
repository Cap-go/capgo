-- Create secrets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'admin_users') THEN
        PERFORM vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'db_url') THEN
        PERFORM vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
    END IF;


    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'apikey') THEN
        PERFORM vault.create_secret('testsecret', 'apikey', 'admin user id');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
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
    TRUNCATE TABLE "public"."deploy_history" CASCADE;

    -- Insert seed data
    -- (Include all your INSERT statements here)

    -- Seed data
    INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
    ('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', now(), now(), 'oljikwwipqrkwilfsyto', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_admin"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsyty', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_user"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsytt', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_user2"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

    INSERT INTO "public"."deleted_account" ("created_at", "email", "id") VALUES
    (now(), encode(digest('deleted@capgo.app', 'sha256'), 'hex'), '00000000-0000-0000-0000-000000000001');

    INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "version", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "storage_unit", "bandwidth_unit", "mau_unit", "price_m_storage_id", "price_m_bandwidth_id", "price_m_mau_id") VALUES
    (now(), now(), 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIs1Yucml9ChU', 100, '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_1KjSGyGH46eYKnWwL4h14DsK', 'price_1KjSKIGH46eYKnWwFG9u4tNi', 3221225472, 268435456000, 10000, 'Best for small business owners', 0, 0, 0, NULL, NULL, NULL),
    (now(), now(), 'Pay as you go', 'plan.payasyougo.desc', 239, 4799, 'prod_MH5Jh6ajC9e7ZH', 1000, '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LYX8yGH46eYKnWwzeBjISvW', 'price_1LYX8yGH46eYKnWwzeBjISvW', 12884901888, 3221225472000, 1000000, 'Best for scalling enterprises', 0.05, 0.1, 0.0002, 'price_1LYXD8GH46eYKnWwaVvggvyy', 'price_1LYXDoGH46eYKnWwPEYVZXui', 'price_1LYXE2GH46eYKnWwo5qd4BTU'),
    (now(), now(), 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIregjtNduh4q', 10, '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1LVvuZGH46eYKnWwuGKOf4DK', 'price_1LVvuIGH46eYKnWwHMDCrxcH', 1073741824, 13958643712, 1000, 'Best for independent developers', 0, 0, 0, NULL, NULL, NULL),
    (now(), now(), 'Team', 'plan.team.desc', 99, 998, 'prod_LQIugvJcPrxhda', 1000, 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSIUGH46eYKnWwWHvg8XYs', 'price_1KjSLlGH46eYKnWwAwMW2wiW', 6442450944, 536870912000, 100000, 'Best for medium enterprises', 0, 0, 0, NULL, NULL, NULL);

    INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
    ('capgo', 'capgo', NULL, now(), now(), 't'),
    ('apps', 'apps', NULL, now(), now(), 'f'),
    ('images', 'images', NULL, now(), now(), 't');

    INSERT INTO "public"."stripe_info" ("created_at", "updated_at", "subscription_id", "customer_id", "status", "product_id", "trial_at", "price_id", "is_good_plan", "plan_usage", "subscription_metered", "subscription_anchor_start", "subscription_anchor_end") VALUES
    (now(), now(), 'sub_1', 'cus_Pa0k8TO6HVln6A', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), now(), 'sub_2', 'cus_Q38uE91NP8Ufqc', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), now(), 'sub_3', 'cus_Pa0f3M6UCQ8g5Q', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), now(), 'sub_4', 'cus_NonOwner', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days');

    -- Do not insert new orgs
    ALTER TABLE users DISABLE TRIGGER generate_org_on_user_create;
    INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enableNotifications", "optForNewsletters", "legalAccepted", "customer_id", "billing_email") VALUES
    ('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', now(), 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', now(), 'f', 'f', 'f', NULL, NULL);
    ALTER TABLE users ENABLE TRIGGER generate_org_on_user_create;

    ALTER TABLE orgs DISABLE TRIGGER generate_org_user_on_org_create;
    INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name", "management_email", "customer_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', now(), now(), '', 'Admin org', 'admin@capgo.app', 'cus_Pa0k8TO6HVln6A'),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), now(), '', 'Demo org', 'test@capgo.app', 'cus_Q38uE91NP8Ufqc'),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', now(), now(), '', 'Test2 org', 'test2@capgo.app', 'cus_Pa0f3M6UCQ8g5Q'),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', now(), now(), '', 'Non-Owner Org', 'test2@capgo.app', 'cus_NonOwner');
    ALTER TABLE orgs ENABLE TRIGGER generate_org_user_on_org_create;

    INSERT INTO "public"."org_users" ("org_id", "user_id", "user_right", "app_id", "channel_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'super_admin'::"user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"user_min_right", null, null),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'super_admin'::"user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'upload'::"user_min_right", null, null),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', 'read'::"user_min_right", null, null);

    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at") VALUES
    (1, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'c591b04e-cf29-4945-b9a0-776d0672061e', 'upload', now()),
    (2, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', '67eeaff4-ae4c-49a6-8eb1-0875f5369de1', 'read', now()),
    (3, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae6e7458-c46d-4c00-aa3b-153b0b8520eb', 'all', now()),
    (4, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061b', 'upload', now()),
    (5, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', now()),
    (6, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', now()),
    (7, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', '985640ce-4031-4cfd-8095-d1d1066b6b3b', 'write', now()),
    (8, now(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', 'upload', now()),
    (9, now(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ac4d9a98-ec25-4af8-933c-2aae4aa52b85', 'all', now());

    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id") VALUES
    (now(), 'com.demoadmin.app', '', 'Demo Admin app', '1.0.0', now(), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a'),
    (now(), 'com.demo.app', '', 'Demo app', '1.0.0', now(), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097');

    INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "r2_path", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider", "owner_org", "user_id", "comment", "link") VALUES
    (1, now(), 'com.demo.app', 'builtin', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', NULL, NULL, NULL),
    (2, now(), 'com.demo.app', 'unknown', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', NULL, NULL, NULL),
    (3, now(), 'com.demo.app', '1.0.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.0.zip', now(), 'f', NULL, '3885ee49', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (4, now(), 'com.demo.app', '1.0.1', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.1.zip', now(), 'f', NULL, '', NULL, 'r2-direct', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (5, now(), 'com.demo.app', '1.361.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.361.0.zip', now(), 'f', NULL, '9d4f798a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (6, now(), 'com.demo.app', '1.360.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.360.0.zip', now(), 'f', NULL, '44913a9f', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (7, now(), 'com.demo.app', '1.359.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.359.0.zip', now(), 'f', NULL, '9f74e70a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app');

    INSERT INTO "public"."app_versions_meta" ("id", "created_at", "app_id", "updated_at", "checksum", "size", "devices") VALUES
    (4,now(), 'com.demo.app', now(), '', 0, 10),
    (3, now(), 'com.demo.app', now(), '3885ee49', 1012506, 10),
    (5, now(), 'com.demo.app', now(), '9d4f798a', 1012529, 20),
    (6, now(), 'com.demo.app', now(), '44913a9f', 1012541, 30),
    (7, now(), 'com.demo.app', now(), '9f74e70a', 1012548, 40);

    INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev", "created_by") VALUES
    (1, now(), 'production', 'com.demo.app', 3, now(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, now(), 'no_access', 'com.demo.app', 5, now(), 'f', 't', 'major'::"public"."disable_update", 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, now(), 'two_default', 'com.demo.app', 3, now(), 't', 't', 'major'::"public"."disable_update", 't', 'f', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);

    INSERT INTO "public"."deploy_history" ("id", "created_at", "updated_at", "channel_id", "app_id", "version_id", "deployed_at", "owner_org", "created_by") VALUES
    (1, now() - interval '15 days', now() - interval '15 days', 1, 'com.demo.app', 3, now() - interval '15 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, now() - interval '10 days', now() - interval '10 days', 1, 'com.demo.app', 5, now() - interval '10 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, now() - interval '5 days', now() - interval '5 days', 1, 'com.demo.app', 3, now() - interval '5 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);

    -- Drop replicated orgs but keet the the seed ones
    DELETE from "orgs" where POSITION('organization' in orgs.name)=1;
    PERFORM setval('apikeys_id_seq', 10, false);
    PERFORM setval('app_versions_id_seq', 8, false);
    PERFORM setval('channel_id_seq', 4, false);
    PERFORM setval('deploy_history_id_seq', 4, false);
END;
$_$;

ALTER FUNCTION "public"."reset_and_seed_data"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_data"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_stats_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_file_size BIGINT;
  random_uuid UUID;
  random_version_id BIGINT := 3;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
  random_daily_change NUMERIC := 0;
  previous_install BIGINT := 0;
  previous_version_id BIGINT := 3;
  current_version_id BIGINT := 4;
BEGIN
  -- Truncate all tables
  TRUNCATE TABLE daily_mau, daily_bandwidth, daily_storage, daily_version, storage_usage, version_usage, device_usage, bandwidth_usage, devices, stats;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), random_uuid, random_version_id, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  --  insert a fix device id for test
  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), '00000000-0000-0000-0000-000000000000', random_version_id, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  INSERT INTO stats (created_at, action, device_id, version, app_id) VALUES
    (now(), 'get'::"public"."stats_action", random_uuid, random_version_id, 'com.demo.app'),
    (now(), 'set'::"public"."stats_action", random_uuid, random_version_id, 'com.demo.app');

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
    IF curr_date != start_date::DATE THEN
      -- Generate a random value between 0.2 and 0.8 using a more reliable method
      random_daily_change := (random() * 0.6 + 0.2);
      IF previous_version_id = 3 THEN
        current_version_id := 4;
      ELSE
        current_version_id := 3;
      END IF;

      INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', previous_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, 0, previous_install * random_daily_change);
      
      INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install * random_daily_change, 0);
      previous_version_id := current_version_id;
      previous_install := previous_install * random_daily_change;
    ELSE
      previous_install := FLOOR(RANDOM() * 50000) + 1;
      INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install, 0);
    END IF;

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
    VALUES (random_timestamp, 'com.demo.app', random_version_id, random_action::"public"."version_action");
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
$$;

ALTER FUNCTION "public"."reset_and_seed_stats_data"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_stats_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_stats_data"() TO "service_role";


CREATE OR REPLACE FUNCTION "public"."reset_app_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    max_version_id bigint;
    max_channel_id bigint;
BEGIN
    -- Delete existing data for the specified app_id
    DELETE FROM deploy_history WHERE app_id = p_app_id;
    DELETE FROM channel_devices WHERE app_id = p_app_id;
    DELETE FROM channels WHERE app_id = p_app_id;
    DELETE FROM app_versions WHERE app_id = p_app_id;
    DELETE FROM apps WHERE app_id = p_app_id;

    -- Get the current max ids and reset the sequences
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_version_id FROM app_versions;
    SELECT COALESCE(MAX(id), 0) + 1 INTO max_channel_id FROM channels;
    
    -- Reset both sequences
    PERFORM setval('app_versions_id_seq', max_version_id, false);
    PERFORM setval('channel_id_seq', max_channel_id, false);
END;
$$;

ALTER FUNCTION "public"."reset_app_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_app_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_app_data"("p_app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8';
    user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097';
    max_version_id bigint;
    max_channel_id bigint;
BEGIN
    -- Lock the tables to prevent concurrent inserts
    LOCK TABLE app_versions, channels IN EXCLUSIVE MODE;

    PERFORM reset_app_data(p_app_id);
    
    -- Insert new app data
    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id")
    VALUES (now(), p_app_id, '', 'Seeded App', '1.0.0', now(), org_id, user_id);

    -- Insert app versions in a single statement
    WITH inserted_versions AS (
        INSERT INTO "public"."app_versions" ("created_at", "app_id", "name", "r2_path", "updated_at", "deleted", "external_url", "checksum", "storage_provider", "owner_org", "comment", "link", "user_id")
        VALUES 
            (now(), p_app_id, 'builtin', NULL, now(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
            (now(), p_app_id, 'unknown', NULL, now(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
            (now(), p_app_id, '1.0.1', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.1.zip', now(), 'f', NULL, '', 'r2-direct', org_id, 'Bug fixes and minor improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.1', user_id),
            (now(), p_app_id, '1.0.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.0.zip', now(), 'f', NULL, '3885ee49', 'r2', org_id, 'Initial release', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.0', user_id),
            (now(), p_app_id, '1.361.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.361.0.zip', now(), 'f', NULL, '9d4f798a', 'r2', org_id, 'Major version update with new features', 'https://github.com/Cap-go/capgo/releases/tag/v1.361.0', user_id),
            (now(), p_app_id, '1.360.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.360.0.zip', now(), 'f', NULL, '44913a9f', 'r2', org_id, 'Pre-release version with experimental features', 'https://github.com/Cap-go/capgo/releases/tag/v1.360.0', user_id),
            (now(), p_app_id, '1.359.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.359.0.zip', now(), 'f', NULL, '9f74e70a', 'r2', org_id, 'Stability improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.359.0', user_id)
        RETURNING id, name
    ),
    inserted_channels AS (
        -- Insert channels using the version IDs from the CTE
        INSERT INTO "public"."channels" ("created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev", "created_by")
        SELECT 
            now(),
            c.name,
            p_app_id,
            v.id,
            now(),
            c.is_public,
            't',
            'major',
            c.ios,
            c.android,
            't',
            't',
            't',
            c.created_by
        FROM (
            VALUES 
                ('production', '1.0.0', true, false, true, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
                ('beta', '1.361.0', false, true, true, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
                ('development', '1.359.0', true, true, false, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
                ('no_access', '1.361.0', false, false, false, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid)
        ) as c(name, version_name, is_public, ios, android, created_by)
        JOIN inserted_versions v ON v.name = c.version_name
        RETURNING id, name, version, created_by
    )
    -- Insert deploy history data
    INSERT INTO "public"."deploy_history" ("created_at", "updated_at", "channel_id", "app_id", "version_id", "deployed_at", "owner_org", "created_by")
    SELECT
        now() - (row_number() OVER (ORDER BY c.id)) * interval '5 days',
        now() - (row_number() OVER (ORDER BY c.id)) * interval '5 days',
        c.id,
        p_app_id,
        c.version,
        now() - (row_number() OVER (ORDER BY c.id)) * interval '5 days',
        org_id,
        c.created_by
    FROM inserted_channels c;

END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete existing data for the specified app_id
  DELETE FROM daily_mau WHERE app_id = p_app_id;
  DELETE FROM daily_bandwidth WHERE app_id = p_app_id;
  DELETE FROM daily_storage WHERE app_id = p_app_id;
  DELETE FROM daily_version WHERE app_id = p_app_id;
  DELETE FROM storage_usage WHERE app_id = p_app_id;
  DELETE FROM version_usage WHERE app_id = p_app_id;
  DELETE FROM device_usage WHERE app_id = p_app_id;
  DELETE FROM bandwidth_usage WHERE app_id = p_app_id;
  DELETE FROM devices WHERE app_id = p_app_id;
  DELETE FROM stats WHERE app_id = p_app_id;
END;
$$;

ALTER FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) TO "service_role";


CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_file_size BIGINT;
  random_uuid UUID;
  random_version_id BIGINT := 3;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
BEGIN
  PERFORM reset_app_stats_data(p_app_id);

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  -- Insert device data
  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), random_uuid, random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't'),
    (now(), '00000000-0000-0000-0000-000000000000', random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  -- Insert stats data
  INSERT INTO stats (created_at, action, device_id, version, app_id) VALUES
    (now(), 'get'::"public"."stats_action", random_uuid, random_version_id, p_app_id),
    (now(), 'set'::"public"."stats_action", random_uuid, random_version_id, p_app_id);

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    
    INSERT INTO daily_mau (app_id, date, mau) VALUES (p_app_id, curr_date, random_mau);
    INSERT INTO daily_bandwidth (app_id, date, bandwidth) VALUES (p_app_id, curr_date, random_bandwidth);
    INSERT INTO daily_storage (app_id, date, storage) VALUES (p_app_id, curr_date, random_storage);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for daily_version
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
    VALUES (curr_date, p_app_id, random_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO storage_usage (device_id, app_id, file_size) VALUES (random_uuid, p_app_id, random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, p_app_id, random_version_id, random_action::"public"."version_action");
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO device_usage (device_id, app_id) VALUES (random_uuid, p_app_id);
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, p_app_id, random_file_size);
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) TO "service_role";

/*---------------------
---- install dbdev ----
----------------------
Requires:
  - pg_tle: https://github.com/aws/pg_tle
  - pgsql-http: https://github.com/pramsey/pgsql-http
-- */

DO $$
BEGIN
    -- Only attempt dbdev installation if extensions are available
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'http') AND 
       EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_tle') THEN
        
        BEGIN
            create extension if not exists http with schema extensions;
            create extension if not exists pg_tle;
            drop extension if exists "supabase-dbdev";
            
            PERFORM pgtle.uninstall_extension_if_exists('supabase-dbdev');
            
            PERFORM pgtle.install_extension(
                'supabase-dbdev',
                resp.contents ->> 'version',
                'PostgreSQL package manager',
                resp.contents ->> 'sql'
            )
            from http(
                (
                    'GET',
                    'https://api.database.dev/rest/v1/'
                    || 'package_versions?select=sql,version'
                    || '&package_name=eq.supabase-dbdev'
                    || '&order=version.desc'
                    || '&limit=1',
                    array[
                        ('apiKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyYndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzIsImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJrzM0AQKsu_5k134s')::http_header
                    ],
                    null,
                    null
                )
            ) x,
            lateral (
                select
                    ((row_to_json(x) -> 'content') #>> '{}')::json -> 0
            ) resp(contents);
            
            create extension if not exists "supabase-dbdev";
            
            -- Check if dbdev schema exists before using it
            IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'dbdev') THEN
                PERFORM dbdev.install('supabase-dbdev');
                drop extension if exists "supabase-dbdev";
                create extension "supabase-dbdev";
                PERFORM dbdev.install('basejump-supabase_test_helpers');
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log the error but continue with seed data
            RAISE NOTICE 'dbdev installation failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'Required extensions (http, pg_tle) not available for dbdev installation';
    END IF;
END $$;

-- Seed data
DO $$
BEGIN
    -- Execute seeding functions
    PERFORM reset_and_seed_data();
    PERFORM reset_and_seed_stats_data();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Seeding failed: %', SQLERRM;
    RAISE;
END $$;
