ALTER TABLE "public"."devices" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow org members to select" ON "public"."devices";
DROP POLICY IF EXISTS "Allow owner to update" ON "public"."devices";
DROP POLICY IF EXISTS "Allow read for auth (read+)" ON "public"."devices";
DROP POLICY IF EXISTS "Allow select app owner" ON "public"."devices";

ALTER TABLE "public"."devices"
ALTER COLUMN "app_id" TYPE character varying(50),
ALTER COLUMN "platform" SET NOT NULL,
ALTER COLUMN "plugin_version" TYPE character varying(20),
ALTER COLUMN "os_version" TYPE character varying(20),
ALTER COLUMN "version_build" TYPE character varying(70),
ALTER COLUMN "custom_id" TYPE character varying(36);

CREATE POLICY "Allow org members to select" ON "public"."devices"
FOR SELECT USING ("public"."check_min_rights"('read'::"public"."user_min_right", (select auth.uid()), "public"."get_user_main_org_id_by_app_id"(("app_id")::"text"), "app_id", NULL::bigint));

CREATE POLICY "Allow owner to update" ON "public"."devices"
FOR UPDATE TO "authenticated" USING ("public"."is_app_owner"((select auth.uid()), "app_id"))
WITH CHECK ("public"."is_app_owner"((select auth.uid()), "app_id"));

CREATE POLICY "Allow read for auth (read+)" ON "public"."devices"
FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow select app owner" ON "public"."devices"
FOR SELECT TO "authenticated" USING (("public"."is_app_owner"((select auth.uid()), "app_id") OR "public"."is_admin"((select auth.uid()))));

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

-- Create the "stats_action" enum type
CREATE TYPE "public"."stats_action" AS ENUM (
'delete',
'reset',
'set',
'get',
'set_fail',
'update_fail',
'download_fail',
'windows_path_fail',
'canonical_path_fail',
'directory_path_fail',
'unzip_fail',
'low_mem_fail',
'download_10',
'download_20',
'download_30',
'download_40',
'download_50',
'download_60',
'download_70',
'download_80',
'download_90',
'download_complete',
'decrypt_fail',
'app_moved_to_foreground',
'app_moved_to_background'
);

DROP TABLE "public"."stats";

CREATE TABLE IF NOT EXISTS "public"."stats" (
    "created_at" timestamp with time zone NOT NULL,
    "action" "public"."stats_action" NOT NULL,
    "device_id" character varying(36) NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying(50) NOT NULL
);

ALTER TABLE "public"."stats" OWNER TO "postgres";

CREATE INDEX "idx_stats_app_id_action" ON "public"."stats" USING "btree" ("app_id", "action");

CREATE INDEX "idx_stats_app_id_created_at" ON "public"."stats" USING "btree" ("app_id", "created_at");

CREATE INDEX "idx_stats_app_id_device_id" ON "public"."stats" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_stats_app_id_version" ON "public"."stats" USING "btree" ("app_id", "version");

GRANT ALL ON TABLE "public"."stats" TO "anon";
GRANT ALL ON TABLE "public"."stats" TO "authenticated";
GRANT ALL ON TABLE "public"."stats" TO "service_role";

CREATE POLICY "Allow apikey to read" ON "public"."stats" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id"));
CREATE POLICY "Allow read for auth (read+)" ON "public"."stats" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;

-- Create the "version_action" enum type
CREATE TYPE "public"."version_action" AS ENUM (
'get',
'fail',
'install',
'uninstall'
);

ALTER TABLE "public"."version_usage"
ALTER COLUMN "action" TYPE "public"."version_action" USING "action"::"public"."version_action",
ALTER COLUMN "app_id" TYPE character varying(50);
