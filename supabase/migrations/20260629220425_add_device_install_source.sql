ALTER TABLE "public"."devices"
ADD COLUMN IF NOT EXISTS "install_source" "text";

COMMENT ON COLUMN "public"."devices"."install_source" IS 'Optional native install source reported by the updater plugin, for example app_store, testflight, or google_play. Android store sources only identify the installer, not the production/alpha/beta/internal track.';

CREATE INDEX IF NOT EXISTS "idx_devices_app_id_install_source"
ON "public"."devices" USING "btree" ("app_id", "install_source")
WHERE "install_source" IS NOT NULL;

