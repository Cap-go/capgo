TRUNCATE TABLE "devices";
TRUNCATE TABLE "app_versions_meta";
TRUNCATE TABLE "logs";

INSERT INTO "devices" ("updated_at", "device_id", "version", "app_id", "platform", "plugin_version", "os_version", "version_build", "custom_id", "is_prod", "is_emulator") VALUES (now64(6), '00009a6b-eefe-490a-9c60-8e965132ae51', 9654, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', true, true);

INSERT INTO "app_versions_meta" ("created_at", "app_id", "size", "id", "action") VALUES (now64(6), 'com.demo.app', 0, 9655, 'add');
INSERT INTO "app_versions_meta" ("created_at", "app_id", "size", "id", "action") VALUES (now64(6), 'com.demo.app', 1012506, 9654, 'add');
INSERT INTO "app_versions_meta" ("created_at", "app_id", "size", "id", "action") VALUES (now64(6), 'com.demo.app', 1012529, 9653, 'add');
INSERT INTO "app_versions_meta" ("created_at", "app_id", "size", "id", "action") VALUES (now64(6), 'com.demo.app', 1012541, 9652, 'add');
INSERT INTO "app_versions_meta" ("created_at", "app_id", "size", "id", "action") VALUES (now64(6), 'com.demo.app', 1012548, 9601, 'add');

INSERT INTO "logs" ("created_at", "platform", "action", "device_id", "version_build", "version", "app_id") VALUES (now64(6), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app');
INSERT INTO "logs" ("created_at", "platform", "action", "device_id", "version_build", "version", "app_id") VALUES (now64(6), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app');
INSERT INTO "logs" ("created_at", "platform", "action", "device_id", "version_build", "version", "app_id") VALUES (now64(6), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app');
INSERT INTO "logs" ("created_at", "platform", "action", "device_id", "version_build", "version", "app_id") VALUES (now64(6), 'android', 'get', '00009a6b-eefe-490a-9c60-8e965132ae51', '1.223.0', 9654, 'com.demo.app');

INSERT INTO "daily_device" ("device_id", "date") VALUES ('00009a6b-eefe-490a-9c60-8e965132ae51', now()::date);
