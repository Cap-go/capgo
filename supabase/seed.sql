-- We create a test queue to test the queue consumer
SELECT
  pgmq.create ('test_queue_consumer');

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

-- We cannot use SET search_path = 'public, extensions' because the digest function is not available in the public schema
CREATE OR REPLACE FUNCTION "public"."reset_and_seed_data" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $_$
DECLARE
    admin_manual_grant_id uuid;
    admin_top_up_grant_id uuid;
    demo_top_up_grant_id uuid;
    admin_bandwidth_overage_id uuid;
    demo_mau_overage_id uuid;
BEGIN
    -- Suppress cascade notices during truncation
    SET LOCAL client_min_messages = WARNING;

    -- Truncate main parent tables - CASCADE will handle dependencies
    TRUNCATE TABLE "auth"."users" CASCADE;
    TRUNCATE TABLE "storage"."buckets" CASCADE;
    TRUNCATE TABLE "public"."stripe_info" CASCADE;
    TRUNCATE TABLE "public"."plans" CASCADE;
    TRUNCATE TABLE "public"."capgo_credits_steps" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_grants" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_transactions" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_consumptions" CASCADE;
    TRUNCATE TABLE "public"."usage_overage_events" CASCADE;
    -- RBAC tables: must truncate in order to respect foreign keys
    TRUNCATE TABLE "public"."role_bindings" RESTART IDENTITY CASCADE;
    TRUNCATE TABLE "public"."group_members" RESTART IDENTITY CASCADE;
    TRUNCATE TABLE "public"."groups" RESTART IDENTITY CASCADE;
    -- Keep RBAC flags deterministic across test runs
    INSERT INTO public.rbac_settings (id, use_new_rbac)
    VALUES (1, false)
    ON CONFLICT (id) DO UPDATE SET use_new_rbac = EXCLUDED.use_new_rbac, updated_at = now();

    -- Insert seed data
    -- (Include all your INSERT statements here)

    -- Seed data
    INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
    ('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', NOW(), NOW(), 'oljikwwipqrkwilfsyto', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_admin"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyty', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_user"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytt', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_user2"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', 'authenticated', 'authenticated', 'stats@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyts', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_stats"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'authenticated', 'authenticated', 'rls@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytr', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_rls"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', 'authenticated', 'authenticated', 'cli_hashed@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytc', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_cli_hashed"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', 'authenticated', 'authenticated', 'encrypted@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyte', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_encrypted"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', 'authenticated', 'authenticated', 'emailprefs@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytp', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_email_prefs"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

    INSERT INTO "public"."deleted_account" ("created_at", "email", "id") VALUES
    (NOW(), encode(extensions.digest('deleted@capgo.app'::bytea, 'sha256'::text)::bytea, 'hex'::text), '00000000-0000-0000-0000-000000000001');

    INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "credit_id", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "build_time_unit") VALUES
    (NOW(), NOW(), 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIs1Yucml9ChU', 'prod_TJRd2hFHZsBIPK', '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_1KjSGyGH46eYKnWwL4h14DsK', 'price_1KjSKIGH46eYKnWwFG9u4tNi', 3221225472, 268435456000, 10000, 'Best for small business owners', 3600),
    (NOW(), NOW(), 'Enterprise', 'plan.payasyougo.desc', 239, 4799, 'prod_MH5Jh6ajC9e7ZH', 'prod_TJRd2hFHZsBIPK', '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LYX8yGH46eYKnWwzeBjISvW', 'price_1LYX8yGH46eYKnWwzeBjISvW', 12884901888, 3221225472000, 1000000, 'Best for scalling enterprises', 600000),
    (NOW(), NOW(), 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIregjtNduh4q', 'prod_TJRd2hFHZsBIPK', '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1LVvuZGH46eYKnWwuGKOf4DK', 'price_1LVvuIGH46eYKnWwHMDCrxcH', 1073741824, 13958643712, 1000, 'Best for independent developers', 1800),
    (NOW(), NOW(), 'Team', 'plan.team.desc', 99, 998, 'prod_LQIugvJcPrxhda', 'prod_TJRd2hFHZsBIPK', 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSIUGH46eYKnWwWHvg8XYs', 'price_1KjSLlGH46eYKnWwAwMW2wiW', 6442450944, 536870912000, 100000, 'Best for medium enterprises', 18000);

    INSERT INTO
      "public"."capgo_credits_steps" (
        type,
        step_min,
        step_max,
        price_per_unit,
        unit_factor,
        org_id
      )
    VALUES
      ('mau', 0, 1000000, 0.003, 1, NULL),
      ('mau', 1000000, 3000000, 0.0022, 1, NULL),
      ('mau', 3000000, 10000000, 0.0016, 1, NULL),
      ('mau', 10000000, 15000000, 0.0014, 1, NULL),
      ('mau', 15000000, 25000000, 0.0011, 1, NULL),
      ('mau', 25000000, 40000000, 0.001, 1, NULL),
      ('mau', 40000000, 100000000, 0.0009, 1, NULL),
      ('mau', 100000000, 9223372036854775807, 0.0007, 1, NULL),
      ('bandwidth', 0, 1099511627776, 0.12, 1073741824, NULL), -- 0–1 TB
      (
        'bandwidth',
        1099511627776,
        2199023255552,
        0.10,
        1073741824,
        NULL
      ), -- 1–2 TB
      (
        'bandwidth',
        2199023255552,
        6597069766656,
        0.085,
        1073741824,
        NULL
      ), -- 2–6 TB
      (
        'bandwidth',
        6597069766656,
        13194139533312,
        0.07,
        1073741824,
        NULL
      ), -- 6–12 TB
      (
        'bandwidth',
        13194139533312,
        27487790694400,
        0.055,
        1073741824,
        NULL
      ), -- 12–25 TB
      (
        'bandwidth',
        27487790694400,
        69269232549888,
        0.04,
        1073741824,
        NULL
      ), -- 25–63 TB
      (
        'bandwidth',
        69269232549888,
        139637976727552,
        0.03,
        1073741824,
        NULL
      ), -- 63–127 TB
      (
        'bandwidth',
        139637976727552,
        9223372036854775807,
        0.02,
        1073741824,
        NULL
      ), -- 127+ TB
      ('storage', 0, 1073741824, 0.09, 1073741824, NULL), -- 0–1 GiB
      (
        'storage',
        1073741824,
        6442450944,
        0.08,
        1073741824,
        NULL
      ), -- 1–6 GiB
      (
        'storage',
        6442450944,
        26843545600,
        0.065,
        1073741824,
        NULL
      ), -- 6–25 GiB
      (
        'storage',
        26843545600,
        67645734912,
        0.05,
        1073741824,
        NULL
      ), -- 25–63 GiB
      (
        'storage',
        67645734912,
        268435456000,
        0.04,
        1073741824,
        NULL
      ), -- 63–250 GiB
      (
        'storage',
        268435456000,
        687194767360,
        0.03,
        1073741824,
        NULL
      ), -- 250–640 GiB
      (
        'storage',
        687194767360,
        1374389534720,
        0.025,
        1073741824,
        NULL
      ), -- 640–1280 GiB
      (
        'storage',
        1374389534720,
        9223372036854775807,
        0.021,
        1073741824,
        NULL
      ), -- 1280+ GiB
      ('build_time', 0, 6000, 0.5, 60, NULL), -- 0-100 minutes (in seconds, displayed as minutes)
      ('build_time', 6000, 30000, 0.45, 60, NULL), -- 100-500 minutes (in seconds, displayed as minutes)
      ('build_time', 30000, 60000, 0.40, 60, NULL), -- 500-1000 minutes (in seconds, displayed as minutes)
      ('build_time', 60000, 300000, 0.35, 60, NULL), -- 1000-5000 minutes (in seconds, displayed as minutes)
      ('build_time', 300000, 600000, 0.30, 60, NULL), -- 5000-10000 minutes (in seconds, displayed as minutes)
      ('build_time', 600000, 9223372036854775807, 0.25, 60, NULL); -- 10000+ minutes (in seconds, displayed as minutes)

    INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
    ('capgo', 'capgo', NULL, NOW(), NOW(), 't'),
    ('apps', 'apps', NULL, NOW(), NOW(), 'f'),
    ('images', 'images', NULL, NOW(), NOW(), 't');

    INSERT INTO "public"."stripe_info" (
      "created_at",
      "updated_at",
      "subscription_id",
      "customer_id",
      "status",
      "product_id",
      "trial_at",
      "price_id",
      "is_good_plan",
      "plan_usage",
      "subscription_anchor_start",
      "subscription_anchor_end",
      "mau_exceeded",
      "bandwidth_exceeded",
      "storage_exceeded",
      "build_time_exceeded"
    ) VALUES
    (NOW(), NOW(), 'sub_1', 'cus_Pa0k8TO6HVln6A', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_2', 'cus_Q38uE91NP8Ufqc', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_3', 'cus_Pa0f3M6UCQ8g5Q', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_4', 'cus_NonOwner', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_5', 'cus_StatsTest', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_rls', 'cus_RLSTest', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cli_hashed', 'cus_cli_hashed_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_encrypted', 'cus_encrypted_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_email_prefs', 'cus_email_prefs_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_app', 'cus_cron_app_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_integration', 'cus_cron_integration_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_queue', 'cus_cron_queue_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_overage', 'cus_overage_test_123', 'succeeded', 'prod_LQIregjtNduh4q', NOW() + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false);

    -- Do not insert new orgs
    ALTER TABLE public.users DISABLE TRIGGER generate_org_on_user_create;
    INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enable_notifications", "opt_for_newsletters") VALUES
    ('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'stats', 'Capgo', NULL, 'stats@capgo.app', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'rls', 'Capgo', NULL, 'rls@capgo.app', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'cli_hashed', 'Capgo', NULL, 'cli_hashed@capgo.app', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'encrypted', 'Capgo', NULL, 'encrypted@capgo.app', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'emailprefs', 'Capgo', NULL, 'emailprefs@capgo.app', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', NOW(), 't', 't');
    ALTER TABLE public.users ENABLE TRIGGER generate_org_on_user_create;

    ALTER TABLE public.orgs DISABLE TRIGGER generate_org_user_stripe_info_on_org_create;
    INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name", "management_email", "customer_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', NOW(), NOW(), '', 'Admin org', 'admin@capgo.app', 'cus_Pa0k8TO6HVln6A'),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Demo org', 'test@capgo.app', 'cus_Q38uE91NP8Ufqc'),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), NOW(), '', 'Test2 org', 'test2@capgo.app', 'cus_Pa0f3M6UCQ8g5Q'),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), NOW(), '', 'Non-Owner Org', 'test2@capgo.app', 'cus_NonOwner'),
    ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', NOW(), NOW(), '', 'Stats Test Org', 'stats@capgo.app', 'cus_StatsTest'),
    ('c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', NOW(), NOW(), '', 'RLS Test Org', 'rls@capgo.app', 'cus_RLSTest'),
    ('f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b92', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', NOW(), NOW(), '', 'CLI Hashed Test Org', 'cli_hashed@capgo.app', 'cus_cli_hashed_test_123'),
    ('a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', NOW(), NOW(), '', 'Encrypted Test Org', 'encrypted@capgo.app', 'cus_encrypted_test_123'),
    ('aa1b2c3d-4e5f-4a60-9b7c-1d2e3f4a5061', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', NOW(), NOW(), '', 'Email Prefs Test Org', 'emailprefs@capgo.app', 'cus_email_prefs_test_123'),
    ('b1c2d3e4-f5a6-4b70-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron App Test Org', 'test@capgo.app', 'cus_cron_app_test_123'),
    ('c2d3e4f5-a6b7-4c80-9d0e-1f2a3b4c5d6e', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron Integration Test Org', 'test@capgo.app', 'cus_cron_integration_test_123'),
    ('d3e4f5a6-b7c8-4d90-8e1f-2a3b4c5d6e7f', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron Queue Test Org', 'test@capgo.app', 'cus_cron_queue_test_123'),
    ('e4f5a6b7-c8d9-4ea0-9f1a-2b3c4d5e6f70', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Overage Test Org', 'test@capgo.app', 'cus_overage_test_123'),
    ('e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a82', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Private Error Test Org', 'test@capgo.app', NULL);
    ALTER TABLE public.orgs ENABLE TRIGGER generate_org_user_stripe_info_on_org_create;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        1000,
        275,
        NOW() - interval '45 days',
        NOW() + interval '6 months',
        'manual',
        '{}'::jsonb,
        'Seed usage credits for admin org'
      )
    RETURNING id INTO admin_manual_grant_id;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      250,
      0,
      NOW() - interval '14 days',
      NOW() + interval '8 months',
      'stripe_top_up',
      jsonb_build_object('paymentIntentId', 'pi_seed_top_up_admin'),
      'Stripe top-up seed for admin org'
    )
    RETURNING id INTO admin_top_up_grant_id;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
      500,
      120,
      NOW() - interval '10 days',
      NOW() + interval '3 months',
      'stripe_top_up',
      jsonb_build_object('paymentIntentId', 'pi_seed_top_up_demo'),
      'Seed usage credits for demo org'
    )
    RETURNING id INTO demo_top_up_grant_id;

    -- Seed realistic credit transactions so the Credits view has ledger data
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        'bandwidth',
        2684354560,
        275,
        275,
        date_trunc('month', NOW()) - interval '1 month',
        date_trunc('month', NOW()),
        jsonb_build_object('note', 'Bandwidth spike from heavy release week')
      )
    RETURNING id INTO admin_bandwidth_overage_id;

    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        'mau',
        185000,
        555,
        120,
        date_trunc('month', NOW()),
        date_trunc('month', NOW()) + interval '1 month',
        jsonb_build_object('note', 'Promo traffic pushed MAU above plan')
      )
    RETURNING id INTO demo_mau_overage_id;

    INSERT INTO public.usage_credit_consumptions (
      grant_id,
      org_id,
      overage_event_id,
      metric,
      credits_used,
      applied_at
    )
    VALUES
      (
        admin_manual_grant_id,
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_bandwidth_overage_id,
        'bandwidth',
        275,
        NOW() - interval '5 days'
      ),
      (
        demo_top_up_grant_id,
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_mau_overage_id,
        'mau',
        120,
        NOW() - interval '1 day'
      );

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_manual_grant_id,
        'manual_grant',
        1000,
        1000,
        NOW() - interval '45 days',
        'Manual starter credits from support',
        jsonb_build_object('notes', 'Initial seed allocation')
      ),
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_top_up_grant_id,
        'purchase',
        250,
        1250,
        NOW() - interval '14 days',
        'Stripe top-up: 250 credits',
        jsonb_build_object('paymentIntentId', 'pi_seed_top_up_admin', 'sessionId', 'cs_test_seed_admin')
      ),
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_manual_grant_id,
        'deduction',
        -275,
        975,
        NOW() - interval '5 days',
        'Overage deduction for bandwidth usage',
        jsonb_build_object('overage_event_id', admin_bandwidth_overage_id, 'metric', 'bandwidth')
      ),
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_top_up_grant_id,
        'purchase',
        500,
        500,
        NOW() - interval '10 days',
        'Stripe top-up: 500 credits',
        jsonb_build_object('paymentIntentId', 'pi_seed_top_up_demo', 'sessionId', 'cs_test_seed_demo')
      ),
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_top_up_grant_id,
        'deduction',
        -120,
        380,
        NOW() - interval '1 day',
        'Overage deduction for MAU spike',
        jsonb_build_object('overage_event_id', demo_mau_overage_id, 'metric', 'mau')
      );

    INSERT INTO "public"."org_users" ("org_id", "user_id", "user_right", "app_id", "channel_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'super_admin'::"public"."user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'super_admin'::"public"."user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'upload'::"public"."user_min_right", null, null),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', 'read'::"public"."user_min_right", null, null),
    ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', 'super_admin'::"public"."user_min_right", null, null),
    ('c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'super_admin'::"public"."user_min_right", null, null),
    ('f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b92', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', 'super_admin'::"public"."user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'admin'::"public"."user_min_right", null, null),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6aa76066-55ef-4238-ade6-0b32334a4097', 'write'::"public"."user_min_right", null, null),
    ('a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', 'super_admin'::"public"."user_min_right", null, null),
    ('aa1b2c3d-4e5f-4a60-9b7c-1d2e3f4a5061', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', 'super_admin'::"public"."user_min_right", null, null),
    ('b1c2d3e4-f5a6-4b70-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null),
    ('c2d3e4f5-a6b7-4c80-9d0e-1f2a3b4c5d6e', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null),
    ('d3e4f5a6-b7c8-4d90-8e1f-2a3b4c5d6e7f', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null),
    ('e4f5a6b7-c8d9-4ea0-9f1a-2b3c4d5e6f70', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null),
    ('e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a82', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"public"."user_min_right", null, null);

    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at", "name") VALUES
    (1, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'c591b04e-cf29-4945-b9a0-776d0672061e', 'upload', NOW(), 'admin upload'),
    (2, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', '67eeaff4-ae4c-49a6-8eb1-0875f5369de1', 'read', NOW(), 'admin read'),
    (3, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae6e7458-c46d-4c00-aa3b-153b0b8520eb', 'all', NOW(), 'admin all'),
    (4, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061b', 'upload', NOW(), 'test upload'),
    (5, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', NOW(), 'test read'),
    (6, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', NOW(), 'test all'),
    (7, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '985640ce-4031-4cfd-8095-d1d1066b6b3b', 'write', NOW(), 'test write'),
    (8, NOW(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', 'upload', NOW(), 'test2 upload'),
    (9, NOW(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ac4d9a98-ec25-4af8-933c-2aae4aa52b85', 'all', NOW(), 'test2 all'),
    -- Dedicated test keys for apikeys.test.ts to avoid interference with other tests
    (10, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5f', 'upload', NOW(), 'apikey test get by id'),
    (11, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5g', 'read', NOW(), 'apikey test update name'),
    (12, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5a', 'all', NOW(), 'apikey test update mode'),
    (13, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5d', 'write', NOW(), 'apikey test update apps'),
    -- Dedicated user and API key for statistics tests
    (14, NOW(), '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5e', 'all', NOW(), 'stats test all'),
    -- Dedicated user and API key for RLS hashed apikey tests (isolated to prevent interference)
    (15, NOW(), '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', '9c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', 'all', NOW(), 'rls test all'),
    -- Dedicated user and API key for CLI hashed apikey tests (isolated to prevent interference)
    (110, NOW(), 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c03', 'all', NOW(), 'cli hashed test all'),
    -- Dedicated user and API key for encrypted bundles tests (isolated to prevent interference)
    (111, NOW(), 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', 'b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d14', 'all', NOW(), 'encrypted test all');

    -- Hashed API key for testing (hash of 'test-hashed-apikey-for-auth-test')
    -- Used by 07_auth_functions.sql tests
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "key_hash", "mode", "updated_at", "name") VALUES
    (100, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', NULL, encode(extensions.digest('test-hashed-apikey-for-auth-test', 'sha256'), 'hex'), 'all', NOW(), 'test hashed all');

    -- Expired hashed API key for testing (expired 1 day ago)
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "key_hash", "mode", "updated_at", "name", "expires_at") VALUES
    (101, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', NULL, encode(extensions.digest('expired-hashed-key-for-test', 'sha256'), 'hex'), 'all', NOW(), 'test expired hashed', NOW() - INTERVAL '1 day');

    -- Expired plain API key for testing (expired 1 day ago)
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at", "name", "expires_at") VALUES
    (102, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'expired-plain-key-for-test', 'all', NOW(), 'test expired plain', NOW() - INTERVAL '1 day');

    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id") VALUES
    (NOW(), 'com.demoadmin.app', '', 'Demo Admin app', '1.0.0', NOW(), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a'),
    (NOW(), 'com.demo.app', '', 'Demo app', '1.0.0', NOW(), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097'),
    (NOW(), 'com.stats.app', '', 'Stats Test App', '1.0.0', NOW(), 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'),
    (NOW(), 'com.rls.app', '', 'RLS Test App', '1.0.0', NOW(), 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'),
    (NOW(), 'com.encrypted.app', '', 'Encrypted Test App', '1.0.0', NOW(), 'a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193'),
    (NOW(), 'com.test2.app', '', 'Test2 App', '1.0.0', NOW(), '34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5');

    INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "r2_path", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider", "owner_org", "user_id", "comment", "link") VALUES
    (1, NOW(), 'com.demo.app', 'builtin', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', NULL, NULL, NULL),
    (2, NOW(), 'com.demo.app', 'unknown', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', NULL, NULL, NULL),
    (3, NOW(), 'com.demo.app', '1.0.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.0.zip', NOW(), 'f', NULL, '3885ee49', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (4, NOW(), 'com.demo.app', '1.0.1', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.1.zip', NOW(), 'f', NULL, '', NULL, 'r2-direct', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (5, NOW(), 'com.demo.app', '1.361.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.361.0.zip', NOW(), 'f', NULL, '9d4f798a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (6, NOW(), 'com.demo.app', '1.360.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.360.0.zip', NOW(), 'f', NULL, '44913a9f', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (7, NOW(), 'com.demo.app', '1.359.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.359.0.zip', NOW(), 'f', NULL, '9f74e70a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (8, NOW(), 'com.demoadmin.app', 'builtin', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', NULL, NULL, NULL),
    (9, NOW(), 'com.demoadmin.app', 'unknown', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', NULL, NULL, NULL),
    (10, NOW(), 'com.demoadmin.app', '1.0.0', 'orgs/22dbad8a-b885-4309-9b3b-a09f8460fb6d/apps/com.demoadmin.app/1.0.0.zip', NOW(), 'f', NULL, 'admin123', NULL, 'r2', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'admin app test version', 'https://capgo.app'),
    (11, NOW(), 'com.stats.app', 'builtin', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', NULL, NULL, NULL),
    (12, NOW(), 'com.stats.app', 'unknown', NULL, NOW(), 't', NULL, NULL, NULL, 'supabase', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', NULL, NULL, NULL),
    (13, NOW(), 'com.stats.app', '1.0.0', 'orgs/b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e/apps/com.stats.app/1.0.0.zip', NOW(), 'f', NULL, 'stats123', NULL, 'r2', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', 'stats test version', 'https://capgo.app'),
    (14, now(), 'com.test2.app', 'builtin', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '34a8c55d-2d0f-4652-a43f-684c7a9403ac', NULL, NULL, NULL),
    (15, now(), 'com.test2.app', 'unknown', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '34a8c55d-2d0f-4652-a43f-684c7a9403ac', NULL, NULL, NULL),
    (16, now(), 'com.test2.app', '1.0.0', 'orgs/34a8c55d-2d0f-4652-a43f-684c7a9403ac/apps/com.test2.app/1.0.0.zip', now(), 'f', NULL, 'test2123', NULL, 'r2', '34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'test2 app version', 'https://capgo.app');

    INSERT INTO "public"."app_versions_meta" ("id", "created_at", "app_id", "updated_at", "checksum", "size") VALUES
    (3, NOW(), 'com.demo.app', NOW(), '3885ee49', 1012506),
    (4, NOW(), 'com.demo.app', NOW(), '', 0),
    (5, NOW(), 'com.demo.app', NOW(), '9d4f798a', 1012529),
    (6, NOW(), 'com.demo.app', NOW(), '44913a9f', 1012541),
    (7, NOW(), 'com.demo.app', NOW(), '9f74e70a', 1012548),
    (10, NOW(), 'com.demoadmin.app', NOW(), 'admin123', 1500000),
    (13, NOW(), 'com.stats.app', NOW(), 'stats123', 850000);

    INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "ios", "android", "electron", "allow_device_self_set", "allow_emulator", "allow_device", "allow_dev", "allow_prod", "created_by") VALUES
    (1, NOW(), 'production', 'com.demo.app', 3, NOW(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, NOW(), 'no_access', 'com.demo.app', 5, NOW(), 'f', 't', 'major'::"public"."disable_update", 't', 't', 'f', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, NOW(), 'two_default', 'com.demo.app', 3, NOW(), 't', 't', 'major'::"public"."disable_update", 't', 'f', 't', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (4, NOW(), 'production', 'com.stats.app', 13, NOW(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't', 't', 't', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'::uuid),
    (5, NOW(), 'electron_only', 'com.demo.app', 3, NOW(), 'f', 't', 'major'::"public"."disable_update", 'f', 'f', 't', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);

    INSERT INTO "public"."deploy_history" ("id", "created_at", "updated_at", "channel_id", "app_id", "version_id", "deployed_at", "owner_org", "created_by") VALUES
    (1, NOW() - interval '15 days', NOW() - interval '15 days', 1, 'com.demo.app', 3, NOW() - interval '15 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, NOW() - interval '10 days', NOW() - interval '10 days', 1, 'com.demo.app', 5, NOW() - interval '10 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, NOW() - interval '5 days', NOW() - interval '5 days', 1, 'com.demo.app', 3, NOW() - interval '5 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (4, NOW() - interval '7 days', NOW() - interval '7 days', 4, 'com.stats.app', 13, NOW() - interval '7 days', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'::uuid, '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'::uuid);

    -- Insert test devices for RLS testing
    INSERT INTO "public"."devices" ("updated_at", "device_id", "version_name", "app_id", "platform", "plugin_version", "os_version", "version_build", "custom_id", "is_prod", "is_emulator") VALUES
    (NOW(), '00000000-0000-0000-0000-000000000001', '1.0.0', 'com.demo.app', 'ios', '4.15.3', '16.0', '1.0.0', 'test-device-1', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000002', '1.0.1', 'com.demo.app', 'android', '4.15.3', '13', '1.0.1', 'test-device-2', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000003', '1.361.0', 'com.demo.app', 'ios', '4.15.3', '15.0', '1.361.0', 'test-device-3', 'f', 't'),
    (NOW(), '00000000-0000-0000-0000-000000000004', '1.0.0', 'com.demoadmin.app', 'android', '4.15.3', '12', '1.0.0', 'admin-test-device', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000005', '1.0.0', 'com.stats.app', 'android', '4.15.3', '11', '1.0.0', 'stats-test-device', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000006', '1.0.0', 'com.demo.app', 'electron', '7.0.0', 'Linux 5.15', '1.0.0', 'electron-test-device', 't', 'f');

    -- Drop replicated orgs but keet the the seed ones
    DELETE from "public"."orgs" where POSITION('organization' in orgs.name)=1;
    PERFORM setval('public.apikeys_id_seq', 111, false);
    PERFORM setval('public.app_versions_id_seq', 16, true);
    PERFORM setval('public.channel_id_seq', 6, false);
    PERFORM setval('public.deploy_history_id_seq', 5, false);
END;
$_$;

ALTER FUNCTION "public"."reset_and_seed_data" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_data" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_and_seed_data" () TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_stats_data" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
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
  demo_org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  i INTEGER;
BEGIN
  -- Truncate all tables
  TRUNCATE TABLE public.daily_mau, public.daily_bandwidth, public.daily_storage, public.daily_version, public.storage_usage, public.version_usage, public.device_usage, public.bandwidth_usage, public.devices, public.stats;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (NOW(), random_uuid, '1.0.0', 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  --  insert a fix device id for test
  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (NOW(), '00000000-0000-0000-0000-000000000000', '1.0.0', 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  INSERT INTO public.stats (created_at, action, device_id, version_name, app_id) VALUES
    (NOW(), 'get'::"public"."stats_action", random_uuid, '1.0.0', 'com.demo.app'),
    (NOW(), 'set'::"public"."stats_action", random_uuid, '1.0.0', 'com.demo.app');

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;

    INSERT INTO public.daily_mau (app_id, date, mau) VALUES ('com.demo.app', curr_date, random_mau);
    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth) VALUES ('com.demo.app', curr_date, random_bandwidth);
    INSERT INTO public.daily_storage (app_id, date, storage) VALUES ('com.demo.app', curr_date, random_storage);

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

      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', previous_version_id, CASE WHEN previous_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, 0, previous_install * random_daily_change);

      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, CASE WHEN current_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install * random_daily_change, 0);
      previous_version_id := current_version_id;
      previous_install := previous_install * random_daily_change;
    ELSE
      previous_install := FLOOR(RANDOM() * 50000) + 1;
      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, CASE WHEN current_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install, 0);
    END IF;

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Add daily_version data for additional apps for testing multi-app view
  curr_date := start_date::DATE + INTERVAL '5 days'; -- Start 5 days later for variety
  WHILE curr_date <= end_date::DATE LOOP
    -- Add data for com.demoadmin.app
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, 'com.demoadmin.app', 10, '1.0.0', FLOOR(RANDOM() * 30) + 5, FLOOR(RANDOM() * 3) + 0, FLOOR(RANDOM() * 20) + 3, 0);

    -- Add data for com.stats.app
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, 'com.stats.app', 13, '1.0.0', FLOOR(RANDOM() * 25) + 8, FLOOR(RANDOM() * 2) + 0, FLOOR(RANDOM() * 15) + 2, 0);

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO public.storage_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO public.version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, 'com.demo.app', random_version_id, random_action::"public"."version_action");
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO public.device_usage (device_id, app_id, org_id)
    VALUES (random_uuid, 'com.demo.app', demo_org_id::text);
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO public.bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_stats_data" () OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_stats_data" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_and_seed_stats_data" () TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_app_data" ("p_app_id" character varying) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    -- Use advisory lock to prevent concurrent execution for the same app
    PERFORM pg_advisory_xact_lock(hashtext(p_app_id));

    -- Delete in dependency order to avoid foreign key conflicts
    DELETE FROM public.deploy_history WHERE app_id = p_app_id;
    DELETE FROM public.channel_devices WHERE app_id = p_app_id;
    DELETE FROM public.channels WHERE app_id = p_app_id;
    DELETE FROM public.app_versions WHERE app_id = p_app_id;
    DELETE FROM public.build_requests WHERE app_id = p_app_id;
    DELETE FROM public.apps WHERE app_id = p_app_id;

    -- Advisory lock is automatically released at transaction end
END;
$$;

ALTER FUNCTION "public"."reset_app_data" ("p_app_id" character varying) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_app_data" ("p_app_id" character varying)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_app_data" ("p_app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_data" (
  "p_app_id" varchar,
  "p_org_id" uuid DEFAULT NULL,
  "p_user_id" uuid DEFAULT NULL,
  "p_admin_user_id" uuid DEFAULT NULL,
  "p_stripe_customer_id" text DEFAULT NULL,
  "p_plan_product_id" text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  org_id uuid := COALESCE(p_org_id, '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid);
  user_id uuid := COALESCE(p_user_id, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);
  admin_user_id uuid := COALESCE(p_admin_user_id, 'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid);
  stripe_customer_id text := COALESCE(p_stripe_customer_id, 'cus_Q38uE91NP8Ufqc');
  plan_product_id text := COALESCE(p_plan_product_id, 'prod_LQIregjtNduh4q');
  org_name text := CASE
    WHEN p_org_id IS NULL THEN 'Demo org'
    ELSE concat('Seeded Org ', p_app_id)
  END;
  builtin_version_id bigint; unknown_version_id bigint; v1_0_1_version_id bigint; v1_0_0_version_id bigint; v1_361_0_version_id bigint; v1_360_0_version_id bigint; v1_359_0_version_id bigint;
  production_channel_id bigint; beta_channel_id bigint; development_channel_id bigint; no_access_channel_id bigint; electron_only_channel_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id));
  PERFORM public.reset_app_data(p_app_id);
  -- Ensure the base Stripe customer and org exist so FK inserts are stable between tests
  INSERT INTO public.stripe_info (
    customer_id,
    product_id,
    subscription_id,
    status,
    trial_at,
    is_good_plan,
    plan_usage,
    subscription_anchor_start,
    subscription_anchor_end,
    mau_exceeded,
    bandwidth_exceeded,
    storage_exceeded,
    build_time_exceeded
  ) VALUES (
    stripe_customer_id,
    plan_product_id,
    'sub_seeded_demo',
    'succeeded',
    NOW() + interval '15 days',
    true,
    2,
    NOW() - interval '15 days',
    NOW() + interval '15 days',
    false,
    false,
    false,
    false
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    subscription_id = EXCLUDED.subscription_id,
    status = EXCLUDED.status,
    trial_at = EXCLUDED.trial_at,
    is_good_plan = EXCLUDED.is_good_plan,
    plan_usage = EXCLUDED.plan_usage,
    subscription_anchor_start = EXCLUDED.subscription_anchor_start,
    subscription_anchor_end = EXCLUDED.subscription_anchor_end,
    mau_exceeded = EXCLUDED.mau_exceeded,
    bandwidth_exceeded = EXCLUDED.bandwidth_exceeded,
    storage_exceeded = EXCLUDED.storage_exceeded,
    build_time_exceeded = EXCLUDED.build_time_exceeded,
    updated_at = NOW();

  INSERT INTO public.orgs (id, created_by, created_at, updated_at, logo, name, management_email, customer_id)
  VALUES (
    org_id,
    user_id,
    NOW(),
    NOW(),
    '',
    org_name,
    'test@capgo.app',
    stripe_customer_id
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    management_email = EXCLUDED.management_email,
    name = EXCLUDED.name,
    updated_at = NOW();

  EXECUTE $sql$
    INSERT INTO public.org_users (org_id, user_id, user_right)
    SELECT $1, $2, 'super_admin'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.org_id = $1 AND ou.user_id = $2
    )
  $sql$ USING org_id, user_id;

  EXECUTE $sql2$
    INSERT INTO public.org_users (org_id, user_id, user_right)
    SELECT $1, $2, 'super_admin'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.org_id = $1 AND ou.user_id = $2
    )
  $sql2$ USING org_id, admin_user_id;

  INSERT INTO public.apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
  VALUES (NOW(), p_app_id, '', 'Seeded App', '1.0.0', NOW(), org_id, user_id);
  WITH version_inserts AS (
    INSERT INTO public.app_versions (created_at, app_id, name, r2_path, updated_at, deleted, external_url, checksum, storage_provider, owner_org, comment, link, user_id)
    VALUES
      (NOW(), p_app_id, 'builtin', NULL, NOW(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
      (NOW(), p_app_id, 'unknown', NULL, NOW(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
      (NOW(), p_app_id, '1.0.1', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.1.zip', NOW(), 'f', NULL, '', 'r2-direct', org_id, 'Bug fixes and minor improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.1', user_id),
      (NOW(), p_app_id, '1.0.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.0.zip', NOW(), 'f', NULL, '3885ee49', 'r2', org_id, 'Initial release', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.0', user_id),
      (NOW(), p_app_id, '1.361.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.361.0.zip', NOW(), 'f', NULL, '9d4f798a', 'r2', org_id, 'Major version update with new features', 'https://github.com/Cap-go/capgo/releases/tag/v1.361.0', user_id),
      (NOW(), p_app_id, '1.360.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.360.0.zip', NOW(), 'f', NULL, '44913a9f', 'r2', org_id, 'Pre-release version with experimental features', 'https://github.com/Cap-go/capgo/releases/tag/v1.360.0', user_id),
      (NOW(), p_app_id, '1.359.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.359.0.zip', NOW(), 'f', NULL, '9f74e70a', 'r2', org_id, 'Stability improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.359.0', user_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='builtin' THEN id END), MAX(CASE WHEN name='unknown' THEN id END), MAX(CASE WHEN name='1.0.1' THEN id END), MAX(CASE WHEN name='1.0.0' THEN id END), MAX(CASE WHEN name='1.361.0' THEN id END), MAX(CASE WHEN name='1.360.0' THEN id END), MAX(CASE WHEN name='1.359.0' THEN id END)
  INTO builtin_version_id, unknown_version_id, v1_0_1_version_id, v1_0_0_version_id, v1_361_0_version_id, v1_360_0_version_id, v1_359_0_version_id FROM version_inserts;
  WITH channel_inserts AS (
    INSERT INTO public.channels (created_at, name, app_id, version, updated_at, public, disable_auto_update_under_native, disable_auto_update, ios, android, electron, allow_device_self_set, allow_emulator, allow_device, allow_dev, allow_prod, created_by, owner_org)
    VALUES
      (NOW(), 'production', p_app_id, v1_0_0_version_id, NOW(), 't', 't', 'major'::public.disable_update, 'f', 't', 't', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'beta', p_app_id, v1_361_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 't', 't', 't', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'development', p_app_id, v1_359_0_version_id, NOW(), 't', 't', 'major'::public.disable_update, 't', 'f', 'f', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'no_access', p_app_id, v1_361_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 'f', 'f', 'f', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'electron_only', p_app_id, v1_360_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 'f', 'f', 't', 't', 't', 't', 't', 't', user_id, org_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='production' THEN id END), MAX(CASE WHEN name='beta' THEN id END), MAX(CASE WHEN name='development' THEN id END), MAX(CASE WHEN name='no_access' THEN id END), MAX(CASE WHEN name='electron_only' THEN id END)
  INTO production_channel_id, beta_channel_id, development_channel_id, no_access_channel_id, electron_only_channel_id FROM channel_inserts;
  INSERT INTO public.deploy_history (created_at, updated_at, channel_id, app_id, version_id, deployed_at, owner_org, created_by)
  VALUES
    (NOW() - interval '15 days', NOW() - interval '15 days', production_channel_id, p_app_id, v1_0_0_version_id, NOW() - interval '15 days', org_id, user_id),
    (NOW() - interval '10 days', NOW() - interval '10 days', beta_channel_id, p_app_id, v1_361_0_version_id, NOW() - interval '10 days', org_id, user_id),
    (NOW() - interval '5 days', NOW() - interval '5 days', development_channel_id, p_app_id, v1_359_0_version_id, NOW() - interval '5 days', org_id, user_id),
    (NOW() - interval '3 days', NOW() - interval '3 days', no_access_channel_id, p_app_id, v1_361_0_version_id, NOW() - interval '3 days', org_id, user_id),
    (NOW() - interval '2 days', NOW() - interval '2 days', electron_only_channel_id, p_app_id, v1_360_0_version_id, NOW() - interval '2 days', org_id, user_id);
  PERFORM builtin_version_id, unknown_version_id, v1_0_1_version_id, v1_360_0_version_id;
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_data" (
  "p_app_id" character varying,
  "p_org_id" uuid,
  "p_user_id" uuid,
  "p_admin_user_id" uuid,
  "p_stripe_customer_id" text,
  "p_plan_product_id" text
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_data" (
  "p_app_id" character varying,
  "p_org_id" uuid,
  "p_user_id" uuid,
  "p_admin_user_id" uuid,
  "p_stripe_customer_id" text,
  "p_plan_product_id" text
)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_and_seed_app_data" (
  "p_app_id" character varying,
  "p_org_id" uuid,
  "p_user_id" uuid,
  "p_admin_user_id" uuid,
  "p_stripe_customer_id" text,
  "p_plan_product_id" text
) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_app_stats_data" ("p_app_id" character varying) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
  -- Use advisory lock to prevent concurrent execution for the same app
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id || '_stats'));

  -- Delete existing data for the specified app_id in dependency order
  DELETE FROM public.daily_mau WHERE app_id = p_app_id;
  DELETE FROM public.daily_bandwidth WHERE app_id = p_app_id;
  DELETE FROM public.daily_storage WHERE app_id = p_app_id;
  DELETE FROM public.daily_version WHERE app_id = p_app_id;
  DELETE FROM public.daily_build_time WHERE app_id = p_app_id;
  DELETE FROM public.storage_usage WHERE app_id = p_app_id;
  DELETE FROM public.version_usage WHERE app_id = p_app_id;
  DELETE FROM public.device_usage WHERE app_id = p_app_id;
  DELETE FROM public.bandwidth_usage WHERE app_id = p_app_id;
  DELETE FROM public.devices WHERE app_id = p_app_id;
  DELETE FROM public.stats WHERE app_id = p_app_id;

  -- Advisory lock is automatically released at transaction end
END;
$$;

ALTER FUNCTION "public"."reset_app_stats_data" ("p_app_id" character varying) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_app_stats_data" ("p_app_id" character varying)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_app_stats_data" ("p_app_id" character varying) TO "service_role";

-- P) reset_and_seed_app_stats_data: cast uuid, drop unused vars
CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_stats_data" ("p_app_id" varchar) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_uuid UUID;
  random_fixed_uuid UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  random_version_id BIGINT := 3;
  org_id uuid;
  fallback_org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  fallback_user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id || '_stats'));
  PERFORM public.reset_app_stats_data(p_app_id);
  random_uuid := gen_random_uuid();
  SELECT owner_org INTO org_id FROM public.apps WHERE app_id = p_app_id LIMIT 1;
  IF org_id IS NULL THEN
    org_id := fallback_org_id;
  END IF;
  INSERT INTO public.apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
  VALUES (NOW(), p_app_id, '', 'Seeded Stats App', '1.0.0', NOW(), org_id, fallback_user_id)
  ON CONFLICT (app_id) DO NOTHING;
  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
  VALUES (NOW(), random_uuid, '1.0.0', p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't'), (NOW(), random_fixed_uuid, '1.0.0', p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't');
  INSERT INTO public.stats (created_at, action, device_id, version_name, app_id)
  VALUES (NOW(), 'get'::public.stats_action, random_uuid, '1.0.0', p_app_id), (NOW(), 'set'::public.stats_action, random_uuid, '1.0.0', p_app_id);
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1; random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1; random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    INSERT INTO public.daily_mau (app_id, date, mau) VALUES (p_app_id, curr_date, random_mau);
    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth) VALUES (p_app_id, curr_date, random_bandwidth);
    INSERT INTO public.daily_storage (app_id, date, storage) VALUES (p_app_id, curr_date, random_storage);
    INSERT INTO public.daily_build_time (app_id, date, build_time_unit, build_count)
    VALUES (p_app_id, curr_date, FLOOR(RANDOM() * 7200) + 300, FLOOR(RANDOM() * 10) + 1);
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, p_app_id, random_version_id, '1.0.0', FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  INSERT INTO public.storage_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) - 5242880 FROM generate_series(1, 20);
  INSERT INTO public.version_usage (timestamp, app_id, version_id, action)
  SELECT start_date + (RANDOM() * (end_date - start_date)), p_app_id, random_version_id, (ARRAY['get','fail','install','uninstall'])[FLOOR(RANDOM() * 4) + 1]::public.version_action FROM generate_series(1, 30);
  INSERT INTO public.device_usage (device_id, app_id, org_id)
  SELECT random_uuid, p_app_id, org_id::text FROM generate_series(1, 50);
  INSERT INTO public.bandwidth_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) + 1 FROM generate_series(1, 40);
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_stats_data" ("p_app_id" character varying) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_stats_data" ("p_app_id" character varying)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_and_seed_app_stats_data" ("p_app_id" character varying) TO "service_role";

-- Seed data
DO $$
DECLARE
    v_migration_result jsonb;
    v_org RECORD;
BEGIN
    -- Execute seeding functions
    PERFORM public.reset_and_seed_data();
    PERFORM public.reset_and_seed_stats_data();
    PERFORM public.reset_and_seed_app_stats_data('com.stats.app');

    -- Repopulate RBAC permissions (wiped by TRUNCATE auth.users CASCADE)
    -- The CASCADE from auth.users -> apps -> app_versions -> permissions clears this table
    RAISE NOTICE 'Repopulating RBAC permissions and role_permissions...';

    INSERT INTO public.permissions (key, scope_type, description)
    VALUES
      (public.rbac_perm_org_read(), public.rbac_scope_org(), 'Read org level settings and metadata'),
      (public.rbac_perm_org_update_settings(), public.rbac_scope_org(), 'Update org configuration/settings'),
      (public.rbac_perm_org_delete(), public.rbac_scope_org(), 'Delete an organization'),
      (public.rbac_perm_org_read_members(), public.rbac_scope_org(), 'Read org membership list'),
      (public.rbac_perm_org_invite_user(), public.rbac_scope_org(), 'Invite or add members to org'),
      (public.rbac_perm_org_update_user_roles(), public.rbac_scope_org(), 'Change org/member roles'),
      (public.rbac_perm_org_read_billing(), public.rbac_scope_org(), 'Read org billing settings'),
      (public.rbac_perm_org_update_billing(), public.rbac_scope_org(), 'Update org billing settings'),
      (public.rbac_perm_org_read_invoices(), public.rbac_scope_org(), 'Read invoices'),
      (public.rbac_perm_org_read_audit(), public.rbac_scope_org(), 'Read org-level audit trail'),
      (public.rbac_perm_org_read_billing_audit(), public.rbac_scope_org(), 'Read billing/audit details'),
      (public.rbac_perm_app_read(), public.rbac_scope_app(), 'Read app metadata'),
      (public.rbac_perm_app_update_settings(), public.rbac_scope_app(), 'Update app settings'),
      (public.rbac_perm_app_delete(), public.rbac_scope_app(), 'Delete an app'),
      (public.rbac_perm_app_read_bundles(), public.rbac_scope_app(), 'Read app bundle metadata'),
      (public.rbac_perm_app_upload_bundle(), public.rbac_scope_app(), 'Upload a bundle'),
      (public.rbac_perm_app_create_channel(), public.rbac_scope_app(), 'Create channels'),
      (public.rbac_perm_app_read_channels(), public.rbac_scope_app(), 'List/read channels'),
      (public.rbac_perm_app_read_logs(), public.rbac_scope_app(), 'Read app logs/metrics'),
      (public.rbac_perm_app_manage_devices(), public.rbac_scope_app(), 'Manage devices at app scope'),
      (public.rbac_perm_app_read_devices(), public.rbac_scope_app(), 'Read devices at app scope'),
      (public.rbac_perm_app_build_native(), public.rbac_scope_app(), 'Trigger native builds'),
      (public.rbac_perm_app_read_audit(), public.rbac_scope_app(), 'Read app-level audit trail'),
      (public.rbac_perm_app_update_user_roles(), public.rbac_scope_app(), 'Update user roles for this app'),
      (public.rbac_perm_app_transfer(), public.rbac_scope_app(), 'Transfer app to another organization'),
      (public.rbac_perm_bundle_delete(), public.rbac_scope_app(), 'Delete a bundle'),
      (public.rbac_perm_channel_read(), public.rbac_scope_channel(), 'Read channel metadata'),
      (public.rbac_perm_channel_update_settings(), public.rbac_scope_channel(), 'Update channel settings'),
      (public.rbac_perm_channel_delete(), public.rbac_scope_channel(), 'Delete a channel'),
      (public.rbac_perm_channel_read_history(), public.rbac_scope_channel(), 'Read deploy history'),
      (public.rbac_perm_channel_promote_bundle(), public.rbac_scope_channel(), 'Promote bundle to channel'),
      (public.rbac_perm_channel_rollback_bundle(), public.rbac_scope_channel(), 'Rollback bundle on channel'),
      (public.rbac_perm_channel_manage_forced_devices(), public.rbac_scope_channel(), 'Manage forced devices'),
      (public.rbac_perm_channel_read_forced_devices(), public.rbac_scope_channel(), 'Read forced devices'),
      (public.rbac_perm_channel_read_audit(), public.rbac_scope_channel(), 'Read channel-level audit'),
      (public.rbac_perm_platform_impersonate_user(), public.rbac_scope_platform(), 'Support/impersonation'),
      (public.rbac_perm_platform_manage_orgs_any(), public.rbac_scope_platform(), 'Administer any org'),
      (public.rbac_perm_platform_manage_apps_any(), public.rbac_scope_platform(), 'Administer any app'),
      (public.rbac_perm_platform_manage_channels_any(), public.rbac_scope_platform(), 'Administer any channel'),
      (public.rbac_perm_platform_run_maintenance_jobs(), public.rbac_scope_platform(), 'Run maintenance/ops jobs'),
      (public.rbac_perm_platform_delete_orphan_users(), public.rbac_scope_platform(), 'Delete orphan users'),
      (public.rbac_perm_platform_read_all_audit(), public.rbac_scope_platform(), 'Read all audit trails'),
      (public.rbac_perm_platform_db_break_glass(), public.rbac_scope_platform(), 'Emergency direct DB access')
    ON CONFLICT (key) DO NOTHING;

    -- Attach permissions to roles
    -- platform_super_admin: full control
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON TRUE
    WHERE r.name = public.rbac_role_platform_super_admin()
    ON CONFLICT DO NOTHING;

    -- org_super_admin: full org + app + channel control
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_org_read(), public.rbac_perm_org_update_settings(), public.rbac_perm_org_delete(), public.rbac_perm_org_read_members(), public.rbac_perm_org_invite_user(), public.rbac_perm_org_update_user_roles(),
      public.rbac_perm_org_read_billing(), public.rbac_perm_org_update_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_audit(), public.rbac_perm_org_read_billing_audit(),
      public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_delete(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
      public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(), public.rbac_perm_app_read_devices(),
      public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(), public.rbac_perm_app_transfer(), public.rbac_perm_bundle_delete(),
      public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
      public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_org_super_admin()
    ON CONFLICT DO NOTHING;

    -- org_admin: org management without billing updates or deletions
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_org_read(), public.rbac_perm_org_update_settings(), public.rbac_perm_org_read_members(), public.rbac_perm_org_invite_user(), public.rbac_perm_org_update_user_roles(),
      public.rbac_perm_org_read_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_audit(), public.rbac_perm_org_read_billing_audit(),
      public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
      public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(), public.rbac_perm_app_read_devices(),
      public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(),
      public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_read_history(),
      public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_org_admin()
    ON CONFLICT DO NOTHING;

    -- org_billing_admin: billing only
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_org_read(), public.rbac_perm_org_read_billing(), public.rbac_perm_org_update_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_billing_audit()
    )
    WHERE r.name = public.rbac_role_org_billing_admin()
    ON CONFLICT DO NOTHING;

    -- org_member: read-only access
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_org_read(), public.rbac_perm_org_read_members(),
      public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit(),
      public.rbac_perm_channel_read(), public.rbac_perm_channel_read_history(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_org_member()
    ON CONFLICT DO NOTHING;

    -- app_admin: full app control
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
      public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(),
      public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(), public.rbac_perm_bundle_delete(),
      public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
      public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_app_admin()
    ON CONFLICT DO NOTHING;

    -- app_developer: upload, manage devices, but no deletion
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(),
      public.rbac_perm_app_manage_devices(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(),
      public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_read_history(),
      public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_app_developer()
    ON CONFLICT DO NOTHING;

    -- app_uploader: upload only
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit()
    )
    WHERE r.name = public.rbac_role_app_uploader()
    ON CONFLICT DO NOTHING;

    -- app_reader: read-only
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit()
    )
    WHERE r.name = public.rbac_role_app_reader()
    ON CONFLICT DO NOTHING;

    -- channel_admin: full channel control
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
      public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(),
      public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_channel_admin()
    ON CONFLICT DO NOTHING;

    -- channel_reader: read-only
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM public.roles r
    JOIN public.permissions p ON p.key IN (
      public.rbac_perm_channel_read(), public.rbac_perm_channel_read_history(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
    )
    WHERE r.name = public.rbac_role_channel_reader()
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'RBAC permissions populated: % permissions, % role_permissions',
      (SELECT COUNT(*) FROM public.permissions),
      (SELECT COUNT(*) FROM public.role_permissions);

    -- Migrate org_users to RBAC role_bindings for all test orgs
    RAISE NOTICE 'Migrating org_users to RBAC role_bindings...';

    FOR v_org IN SELECT id, name FROM public.orgs ORDER BY created_at
    LOOP
        SELECT public.rbac_migrate_org_users_to_bindings(v_org.id) INTO v_migration_result;
        RAISE NOTICE 'Org [%] "%": %', v_org.id, v_org.name, v_migration_result;
    END LOOP;

    RAISE NOTICE 'RBAC migration completed successfully';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Seeding failed: %', SQLERRM;
    RAISE;
END $$;
