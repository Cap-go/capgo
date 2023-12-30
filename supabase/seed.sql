INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', now(), now(), 'oljikwwipqrkwilfsyto', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsyty', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsytt', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

select vault.create_secret('["c591b04e-cf29-4945-b9a0-776d0672061a"]', 'admin_users', 'admins user id');
select vault.create_secret('http://172.17.0.1:54321', 'db_url', 'db url');
select vault.create_secret('http://localhost:8881/.netlify/functions/', 'external_function_url', 'external function url'); -- Netlify backend for long runny functions
select vault.create_secret('testsecret', 'apikey', 'admin user id');
select vault.create_secret('http://host.docker.internal:6655', 'd1_http_url', 'd1 replication HTTP url');
select vault.create_secret('***', 'd1_cf_apikey', 'D1 cloudflare API key');

CREATE TRIGGER on_channel_create 
AFTER INSERT ON public.channels 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_create');

CREATE TRIGGER on_channel_update 
AFTER UPDATE ON public.channels 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_channel_update');

CREATE TRIGGER on_shared_create 
AFTER INSERT ON public.channel_users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_shared_create');

CREATE TRIGGER on_user_create 
AFTER INSERT ON public.users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_create');

CREATE TRIGGER on_user_update 
AFTER UPDATE ON public.users 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_user_update');

CREATE TRIGGER on_version_create 
AFTER INSERT ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_create');

CREATE TRIGGER on_version_delete
AFTER DELETE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_post_to_function('on_version_delete');

CREATE TRIGGER on_version_update 
AFTER UPDATE ON public.app_versions 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_version_update');

CREATE TRIGGER on_devices_override_update 
AFTER INSERT or UPDATE or DELETE ON public.devices_override 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');

CREATE TRIGGER on_channel_devices_update 
AFTER INSERT or UPDATE or DELETE ON public.channel_devices 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_device_update');

INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "app", "channel", "update", "version", "shared", "abtest", "progressive_deploy", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "storage_unit", "bandwidth_unit", "mau_unit", "price_m_storage_id", "price_m_bandwidth_id", "price_m_mau_id") VALUES
('2022-06-05 12:25:28+00', '2022-10-05 16:00:46.563382+00', 'Free', 'plan.free.desc', 0, 0, 'free', 1, 1, 500, 10, 0, 'f', 'f', 'c2f582d7-7dcb-4a65-b8da-82cc74a0645d', 'free', 'free', 0.1, 0.5, 50, 'Best for discover', 0, 0, 0, NULL, NULL, NULL),
('2022-05-31 10:59:55+00', '2023-02-18 17:03:23.973973+00', 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIzozukEwDZDM', 3, 10, 25000, 100, 10, 'f', 'f', '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_146eYKKjSNPGHnWwVGG5HI5V', 'price_1MctWwU7vJZOnvGH46eYKnRH', 3, 250, 5000, 'Best for small business owners', 0, 0, 0, NULL, NULL, NULL),
('2022-08-24 16:07:00+00', '2023-02-18 17:07:39.265733+00', 'Pay as you go', 'plan.payasyougo.desc', 499, 4799, 'prod_MIy30G5ywsjiUu', 100, 500, 2500000, 1000, 0, 't', 't', '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LpDbYKnWw14egGH46eXiN7R', 'price_1H46eYMctsZGKnWwm0hwRLl2', 12, 3000, 40000, 'Best for scalling enterprises', 0.5, 0.9, 0.0006, 'price_1LaC7pGH46eMYKnWwLnKLmIW', 'price_146aM7pGHw7G04teYKnWLyRq', 'price_aM7pGHn146eYKLWwUvNTfahd'),
('2022-05-31 10:58:34+00', '2022-05-31 10:58:34+00', 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIzwwVu6oMmAz', 1, 2, 2500, 10, 0, 'f', 'f', '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1KkIN4wh6eEoGHi97YKnWw1B', 'price_1KjnWwofmSNTGH46eYKXyBZn', 1, 25, 500, 'Best for independent developers', 0, 0, 0, NULL, NULL, NULL),
('2022-05-31 11:01:56+00', '2022-10-04 16:03:29.836516+00', 'Team', 'plan.team.desc', 99, 998, 'prod_LQIzm2NGzayzXi', 10, 50, 250000, 1000, 1000, 't', 't', 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSNKYKnWw32bhGH46ez1xX', 'price_1KGH46eYKnKjSNWwx0pSkXE6', 6, 500, 10000, 'Best for medium enterprises', 0, 0, 0, NULL, NULL, NULL);

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
('apps', 'apps', NULL, '2021-12-27 23:51:01.568349+00', '2021-12-27 23:51:01.568349+00', 'f'),
('images', 'images', NULL, '2021-12-27 23:50:34.743465+00', '2021-12-27 23:50:34.743465+00', 't');

INSERT INTO "public"."stripe_info" ("created_at", "updated_at", "subscription_id", "customer_id", "status", "product_id", "trial_at", "price_id", "is_good_plan", "plan_usage", "subscription_metered", "subscription_anchor_start", "subscription_anchor_end") VALUES
(now(), '2023-03-21 03:04:42.120379+00', 'free', 'cus_Lo5enUbshix5u5', NULL, 'free', now() + interval '15 days', NULL, 't', 2, '{}', now(), now() + interval '1 months'),
(now(), '2023-03-21 03:04:42.120379+00', 'free', 'cus_Lo5enUbshix5u7', NULL, 'free', now() + interval '15 days', NULL, 't', 2, '{}', now(), now() + interval '1 months'),
(now(), '2023-03-21 03:04:42.120379+00', 'free', 'cus_Lo5enUbshix5u8', NULL, 'free', now() + interval '15 days', NULL, 't', 2, '{}', now(), now() + interval '1 months');

INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enableNotifications", "optForNewsletters", "legalAccepted", "customer_id", "billing_email") VALUES
('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', 'cus_Lo5enUbshix5u5', NULL),
('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', 'cus_Lo5enUbshix5u7', NULL),
('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', 'cus_Lo5enUbshix5u8', NULL);

INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name") VALUES
('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Admin org'),
('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Demo org'),
('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '', 'Test2 org');

INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at") VALUES
(911, '2022-07-12 12:06:18.822406+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'upload', '2022-07-12 12:06:18.822406+00'),
(912, '2022-07-12 12:06:22.425878+00', '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', '2022-07-12 12:06:22.425878+00'),
(913, '2022-07-12 12:06:36.468855+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', '2022-07-12 12:06:36.468855+00'),
(914, '2022-07-12 12:06:36.468855+00', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85', 'all', '2022-07-12 12:06:36.468855+00'),
(915, '2022-07-12 12:06:36.468855+00', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', 'upload', '2022-07-12 12:06:36.468855+00');

INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "user_id", "name", "last_version", "updated_at", "id") VALUES
('2022-03-07 14:08:28.910887+00', 'com.demoadmin.app', '', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'Demo Admin app', '1.0.0', '2023-03-20 00:46:33.006797+00', 'f8b37304-0fb8-48b2-9ef8-ff3d7c50a792'),
('2022-03-07 14:08:28.910887+00', 'com.demo.app', '', '6aa76066-55ef-4238-ade6-0b32334a4097', 'Demo app', '1.0.0', '2023-03-20 00:46:33.006797+00', 'f8b37304-0fb8-48b2-9ef8-ff3d7c50a792');

INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "user_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider") VALUES
(9654, now(), 'com.demo.app', '1.0.0', '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', NULL, '3885ee49', NULL, 'r2'),
(9653, now(), 'com.demo.app', '1.361.0', '3dfe0df9-94fa-4ae8-b538-3f1a9b305687', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', NULL, '9d4f798a', NULL, 'r2'),
(9652, now(), 'com.demo.app', '1.360.0', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', NULL, '44913a9f', NULL, 'r2'),
(9601, now(), 'com.demo.app', '1.359.0', '8aafd924-bd31-43be-8f35-3f6957890ff9', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', NULL, '9f74e70a', NULL, 'r2'),
(1884, now(), 'com.demo.app', 'builtin', NULL, '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 't', NULL, NULL, NULL, 'supabase'),
(1883, now(), 'com.demo.app', 'unknown', NULL, '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 't', NULL, NULL, NULL, 'supabase');

INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "user_id", "updated_at", "checksum", "size", "id", "devices") VALUES
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:46:33.664139+00', '3885ee49', 1012506, 9654, 10),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:33:16.912242+00', '9d4f798a', 1012529, 9653, 20),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:29:35.189367+00', '44913a9f', 1012541, 9652, 30),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-16 16:28:44.815867+00', '9f74e70a', 1012548, 9601, 40);

INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "created_by", "updated_at", "public", "disableAutoUpdateUnderNative", "disableAutoUpdate", "beta", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev") VALUES
(22, now(), 'production', 'com.demo.app', 9654, '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-02-28 10:50:58.246133+00', 't', 't', 'major'::"public"."disable_update", 'f', 'f', 't', 't', 't', 't'),
(23, now(), 'no_access', 'com.demo.app', 9653, '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-02-28 10:50:58.246133+00', 'f', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't'),
(24, now(), 'two_default', 'com.demo.app', 9654, '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-02-28 10:50:58.246133+00', 't', 't', 'major'::"public"."disable_update", 'f', 't', 'f', 't', 't', 't');

-- INSERT INTO "public"."devices" ("created_at", "updated_at", "device_id", "version", "app_id", "platform", "plugin_version", "os_version", "version_build", "custom_id", "is_prod", "is_emulator") VALUES
-- (now(), '2023-01-29 08:09:32.324+00', '00009a6b-eefe-490a-9c60-8e965132ae51', 9654, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');
-- INSERT INTO "public"."org_users" ("id", "created_at", "updated_at", "user_id", "org_id", "app_id", "channel_id", "user_right") VALUES
-- (1, '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', 'c591b04e-cf29-4945-b9a0-776d0672061a', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'com.demoadmin.app', NULL, 'admin'),
-- (2, '2022-03-07 14:08:28.910887+00', '2022-03-07 14:08:28.910887+00', '6aa76066-55ef-4238-ade6-0b32334a4097', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'com.demo.app', 22, 'admin');

INSERT INTO "public"."devices" ("created_at", "updated_at", "device_id", "version", "app_id", "platform", "plugin_version", "os_version", "version_build", "custom_id", "is_prod", "is_emulator") VALUES
(now(), '2023-01-29 08:09:32.324+00', '00009a6b-eefe-490a-9c60-8e965132ae51', 9654, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

INSERT INTO "public"."stats" ("created_at", "platform", "action", "device_id", "version_build", "version", "app_id") VALUES
(now(), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app'),
(now(), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app'),
(now(), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app'),
(now(), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app');

INSERT INTO "public"."app_usage" ("id", "app_id", "date", "mau", "storage_added", "storage_deleted", "bandwidth", "get", "uninstall", "install", "fail") VALUES
("gen_random_uuid"(), 'com.demo.app', '2023-03-01', 1, 10948, 0, 141264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-02', 4, 20948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-03', 8, 80948, 0, 1441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-04', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-05', 40, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-06', 41, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-07', 49, 180948, 0, 1441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-08', 60, 180948, 0, 1441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-09', 20, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-10', 10, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-11', 20, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-12', 25, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-13', 1, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-14', 30, 180948, 0, 1441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-15', 90, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-16', 30, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-17', 200, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-18', 20, 180948, 0, 1441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-19', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-20', 40, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-21', 30, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-22', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-23', 20, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-24', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-25', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-26', 20, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-27', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-28', 20, 180948, 0, 441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-29', 20, 180948, 0, 2441264, 1, 2, 3, 4),
("gen_random_uuid"(), 'com.demo.app', '2023-03-30', 20, 180948, 0, 2441264, 1, 2, 3, 4);

-- Create cron jobs
-- Set old versions to deleted after retention passed 
SELECT cron.schedule('Delete old app version', '40 0 * * *', $$CALL update_app_versions_retention()$$);
-- update channel for progressive deploy if too many fail
SELECT cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);
SELECT cron.schedule('Update web stats', '22 1 * * *', $$SELECT http_post_to_function('web_stats-background', 'external', '{}'::jsonb)$$);
SELECT cron.schedule('Update plan', '0 1 * * *', $$SELECT http_post_to_function('cron_good_plan-background', 'external', '{}'::jsonb)$$);
SELECT cron.schedule('Send stats email every week', '0 12 * * 6', $$SELECT http_post_to_function('cron_email-background', 'external', '{}'::jsonb)$$);
