CREATE INDEX IF NOT EXISTS "idx_app_versions_deleted_r2_path"
ON "public"."app_versions" USING "btree" ("owner_org", "app_id", "r2_path")
WHERE ("deleted" = true);
