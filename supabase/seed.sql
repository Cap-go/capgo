INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'unknow.unknow@unknow.com', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', '2022-06-03 05:54:01.738773+00', '2022-06-03 05:54:01.738773+00', 'oljikwwipqrkwilfsyto', '2022-06-03 05:54:01.738773+00', '', NULL, '', '', NULL, '2023-03-21 03:43:33.887117+00', '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}}', 'f', '2022-06-03 05:54:01.718499+00', '2023-03-21 03:43:40.235943+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "app", "channel", "update", "version", "shared", "abtest", "progressive_deploy", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "storage_unit", "bandwidth_unit", "mau_unit", "price_m_storage_id", "price_m_bandwidth_id", "price_m_mau_id") VALUES
('2022-06-05 12:25:28+00', '2022-10-05 16:00:46.563382+00', 'Free', 'plan.free.desc', 0, 0, 'free', 1, 1, 500, 10, 0, 'f', 'f', 'c2f582d7-7dcb-4a65-b8da-82cc74a0645d', 'free', 'free', 0.1, 0.5, 50, 'Best for discover', 0, 0, 0, NULL, NULL, NULL),
('2022-05-31 10:59:55+00', '2023-02-18 17:03:23.973973+00', 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIzozukEwDZDM', 3, 10, 25000, 100, 10, 'f', 'f', '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_146eYKKjSNPGHnWwVGG5HI5V', 'price_1MctWwU7vJZOnvGH46eYKnRH', 3, 250, 5000, 'Best for small business owners', 0, 0, 0, NULL, NULL, NULL),
('2022-08-24 16:07:00+00', '2023-02-18 17:07:39.265733+00', 'Pay as you go', 'plan.payasyougo.desc', 499, 4799, 'prod_MIy30G5ywsjiUu', 100, 500, 2500000, 1000, 0, 't', 't', '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LpDbYKnWw14egGH46eXiN7R', 'price_1H46eYMctsZGKnWwm0hwRLl2', 12, 3000, 40000, 'Best for scalling enterprises', 0.5, 0.9, 0.0006, 'price_1LaC7pGH46eMYKnWwLnKLmIW', 'price_146aM7pGHw7G04teYKnWLyRq', 'price_aM7pGHn146eYKLWwUvNTfahd'),
('2022-05-31 10:58:34+00', '2022-05-31 10:58:34+00', 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIzwwVu6oMmAz', 1, 2, 2500, 10, 0, 'f', 'f', '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1KkIN4wh6eEoGHi97YKnWw1B', 'price_1KjnWwofmSNTGH46eYKXyBZn', 1, 25, 500, 'Best for independent developers', 0, 0, 0, NULL, NULL, NULL),
('2022-05-31 11:01:56+00', '2022-10-04 16:03:29.836516+00', 'Team', 'plan.team.desc', 99, 998, 'prod_LQIzm2NGzayzXi', 10, 50, 250000, 1000, 1000, 't', 't', 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSNKYKnWw32bhGH46ez1xX', 'price_1KGH46eYKnKjSNWwx0pSkXE6', 6, 500, 10000, 'Best for medium enterprises', 0, 0, 0, NULL, NULL, NULL);


INSERT INTO "public"."stripe_info" ("created_at", "updated_at", "subscription_id", "customer_id", "status", "product_id", "trial_at", "price_id", "is_good_plan", "plan_usage", "subscription_metered", "subscription_anchor") VALUES
('2022-06-03 05:54:46.000134+00', '2023-03-21 03:04:42.120379+00', NULL, 'cus_Lo5enUbshix5u5', NULL, 'free', '2022-07-03 05:54:46.000134+00', NULL, 't', 2, '{}', '2023-01-14 14:54:45.736228+00');

INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enableNotifications", "optForNewsletters", "legalAccepted", "customer_id", "billing_email") VALUES
('2022-06-03 05:54:15+00', '', 'unknow', 'unknow', NULL, 'unknow.unknow@unknow.com', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-21 01:00:01.707314+00', 'f', 'f', 'f', 'cus_Lo5enUbshix5u5', NULL);

INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at") VALUES
(911, '2022-07-12 12:06:18.822406+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'upload', '2022-07-12 12:06:18.822406+00'),
(912, '2022-07-12 12:06:22.425878+00', '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', '2022-07-12 12:06:22.425878+00'),
(913, '2022-07-12 12:06:36.468855+00', '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', '2022-07-12 12:06:36.468855+00');

INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "user_id", "name", "last_version", "updated_at", "id") VALUES
('2022-03-07 14:08:28.910887+00', 'com.demo.app', '', '6aa76066-55ef-4238-ade6-0b32334a4097', 'Demo app', '1.0.0', '2023-03-20 00:46:33.006797+00', 'f8b37304-0fb8-48b2-9ef8-ff3d7c50a792');

INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "user_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider") VALUES
(9654, now(), 'com.demo.app', '1.0.0', '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:46:35.187846+00', 'f', NULL, '3885ee49', NULL, 'r2'),
(9653, now(), 'com.demo.app', '1.361.0', '3dfe0df9-94fa-4ae8-b538-3f1a9b305687', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:33:18.768949+00', 'f', NULL, '9d4f798a', NULL, 'r2'),
(9652, now(), 'com.demo.app', '1.360.0', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:29:37.044903+00', 'f', NULL, '44913a9f', NULL, 'r2'),
(9601, now(), 'com.demo.app', '1.359.0', '8aafd924-bd31-43be-8f35-3f6957890ff9', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-16 16:28:46.505275+00', 'f', NULL, '9f74e70a', NULL, 'r2');

INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "user_id", "updated_at", "checksum", "size", "id", "devices") VALUES
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:46:33.664139+00', '3885ee49', 1012506, 9654, 10),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:33:16.912242+00', '9d4f798a', 1012529, 9653, 20),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:29:35.189367+00', '44913a9f', 1012541, 9652, 30),
(now(), 'com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-16 16:28:44.815867+00', '9f74e70a', 1012548, 9601, 40);

INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "created_by", "updated_at", "public", "disableAutoUpdateUnderNative", "disableAutoUpdateToMajor", "beta", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev") VALUES
(22, now(), 'production', 'com.demo.app', 9654, '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-02-28 10:50:58.246133+00', 't', 't', 't', 'f', 't', 't', 'f', 't', 't');

INSERT INTO "public"."devices" ("created_at", "updated_at", "device_id", "version", "app_id", "platform", "plugin_version", "os_version", "date_id", "version_build", "custom_id", "is_prod", "is_emulator") VALUES
(now(), '2023-01-29 08:09:32.324+00', '00009a6b-eefe-490a-9c60-8e965132ae51', 9654, 'com.demo.app', 'android', '4.15.3', '9', '', '1.223.0', '', 't', 't');

INSERT INTO "public"."stats" ("id", "created_at", "platform", "action", "device_id", "version_build", "version", "app_id", "updated_at") VALUES
(11783621, now(), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app', '2023-03-20 00:46:33.664139+00');

INSERT INTO "public"."app_stats" ("app_id", "user_id", "created_at", "updated_at", "channels", "mlu", "versions", "shared", "mlu_real", "devices", "date_id", "version_size", "bandwidth", "devices_real") VALUES
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-01 01:18:54.034372+00', '2023-03-01 01:18:54.034372+00', 1, 65, 4, 0, 34, 1, to_char(now(), 'YYYY-MM'), 1099392048, 14761264, 1),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-20 00:29:35.269652+00', '2023-03-20 00:29:35.269652+00', 0, 0, 3, 0, 5, 1, CONCAT(to_char(now(), 'YYYY-MM'), '-20'), 3037576, 0, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-19 10:58:12.72939+00', '2023-03-19 10:58:12.72939+00', 0, 1, 0, 0, 1, 1, CONCAT(to_char(now(), 'YYYY-MM'), '-19'), 0, 1186174, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-17 18:36:33.990542+00', '2023-03-17 18:36:33.990542+00', 0, 4, 0, 0, 3, 1, CONCAT(to_char(now(), 'YYYY-MM'), '-18'), 0, 0, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-16 02:32:52.480687+00', '2023-03-16 02:32:52.480687+00', 0, 0, 8, 0, 2, 0, CONCAT(to_char(now(), 'YYYY-MM'), '-17'), 8082814, 2222800, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-15 10:22:12.093789+00', '2023-03-15 10:22:12.093789+00', 0, 1, 2, 0, 2, 2, CONCAT(to_char(now(), 'YYYY-MM'), '-16'), 2019310, 2297858, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-14 01:10:13.411745+00', '2023-03-14 01:10:13.411745+00', 0, 2, 3, 0, 2, 2, CONCAT(to_char(now(), 'YYYY-MM'), '-15'), 3028777, 2299160, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-13 00:00:29.998369+00', '2023-03-13 00:00:29.998369+00', 0, 2, 12, 0, 12, 2, CONCAT(to_char(now(), 'YYYY-MM'), '-14'), 12116426, 3558522, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-12 12:15:02.435343+00', '2023-03-12 12:15:02.435343+00', 0, 4, 2, 0, 0, 0, CONCAT(to_char(now(), 'YYYY-MM'), '-12'), 2019794, 0, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-10 02:18:56.858159+00', '2023-03-10 02:18:56.858159+00', 0, 1, 3, 0, 3, 3, CONCAT(to_char(now(), 'YYYY-MM'), '-11'), 3029547, 3196750, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-09 01:21:43.772115+00', '2023-03-09 01:21:43.772115+00', 0, 3, 2, 0, 8, 3, CONCAT(to_char(now(), 'YYYY-MM'), '-10'), 2019736, 9196812, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-08 12:51:32.336522+00', '2023-03-08 12:51:32.336522+00', 0, 2, 9, 0, 4, 1, CONCAT(to_char(now(), 'YYYY-MM'), '-09'), 9088532, 1112986, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-07 01:54:52.849452+00', '2023-03-07 01:54:52.849452+00', 0, 0, 7, 0, 0, 0, CONCAT(to_char(now(), 'YYYY-MM'), '-08'), 7066021, 0, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-06 02:35:06.007812+00', '2023-03-06 02:35:06.007812+00', 0, 5, 4, 0, 9, 3, CONCAT(to_char(now(), 'YYYY-MM'), '-07'), 4032908, 9489392, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-05 07:13:11.220198+00', '2023-03-05 07:13:11.220198+00', 0, 2, 0, 0, 2, 2, CONCAT(to_char(now(), 'YYYY-MM'), '-06'), 0, 2372348, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-04 11:15:39.563771+00', '2023-03-04 11:15:39.563771+00', 0, 2, 0, 0, 1, 1, CONCAT(to_char(now(), 'YYYY-MM'), '-04'), 0, 0, 0),
('com.demo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-03-03 08:40:15.224005+00', '2023-03-03 08:40:15.224005+00', 0, 2, 0, 0, 6, 2, CONCAT(to_char(now(), 'YYYY-MM'), '-01'), 0, 6576705, 0);