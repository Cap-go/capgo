CREATE TABLE IF NOT EXISTS "public"."daily_storage_hourly" (
  "app_id" character varying(255) NOT NULL REFERENCES "public"."apps"("app_id") ON DELETE CASCADE,
  "owner_org" uuid NOT NULL REFERENCES "public"."orgs"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "storage_byte_hours" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "daily_storage_hourly_pkey" PRIMARY KEY ("app_id", "date")
);

ALTER TABLE "public"."daily_storage_hourly" OWNER TO "postgres";

COMMENT ON TABLE "public"."daily_storage_hourly" IS 'Shadow daily storage-hour usage, recorded as byte-hours. This is intentionally not used for billing until storage-hour billing is explicitly enabled.';
COMMENT ON COLUMN "public"."daily_storage_hourly"."storage_byte_hours" IS 'Byte-hour contribution for this UTC day.';

CREATE INDEX IF NOT EXISTS "idx_daily_storage_hourly_date" ON "public"."daily_storage_hourly" USING "btree" ("date");
CREATE INDEX IF NOT EXISTS "idx_daily_storage_hourly_owner_org_date" ON "public"."daily_storage_hourly" USING "btree" ("owner_org", "date");
CREATE INDEX IF NOT EXISTS "idx_version_meta_app_id_timestamp" ON "public"."version_meta" USING "btree" ("app_id", "timestamp");

ALTER TABLE "public"."daily_storage_hourly" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_storage_hourly"
FOR SELECT
TO "anon", "authenticated"
USING (
  "public"."check_min_rights"(
    'read'::"public"."user_min_right",
    "public"."get_identity_org_appid"(
      '{read,upload,write,all}'::"public"."key_mode"[],
      "daily_storage_hourly"."owner_org",
      "daily_storage_hourly"."app_id"
    ),
    "daily_storage_hourly"."owner_org",
    "daily_storage_hourly"."app_id",
    NULL::bigint
  )
);

CREATE POLICY "Deny insert on daily_storage_hourly" ON "public"."daily_storage_hourly"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

CREATE POLICY "Deny update on daily_storage_hourly" ON "public"."daily_storage_hourly"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny delete on daily_storage_hourly" ON "public"."daily_storage_hourly"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);

GRANT SELECT ON TABLE "public"."daily_storage_hourly" TO "anon";
GRANT SELECT ON TABLE "public"."daily_storage_hourly" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_storage_hourly" TO "service_role";
