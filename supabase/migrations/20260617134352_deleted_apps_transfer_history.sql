ALTER TABLE "public"."deleted_apps"
ADD COLUMN IF NOT EXISTS "transfer_history" jsonb[] DEFAULT '{}'::jsonb[];

COMMENT ON COLUMN "public"."deleted_apps"."created_at" IS 'Original app creation timestamp for rows written by on_app_delete. Legacy rows may equal deleted_at when the original creation timestamp was not preserved.';

WITH "deleted_app_first_seen" AS (
  SELECT
    "deleted_apps"."id",
    MIN("app_versions"."created_at") AS "created_at"
  FROM "public"."deleted_apps" AS "deleted_apps"
  INNER JOIN "public"."app_versions" AS "app_versions" ON "app_versions"."app_id" = "deleted_apps"."app_id"
  WHERE "deleted_apps"."created_at" = "deleted_apps"."deleted_at"
  GROUP BY "deleted_apps"."id"
)
UPDATE "public"."deleted_apps" AS "deleted_apps"
SET "created_at" = "deleted_app_first_seen"."created_at"
FROM "deleted_app_first_seen"
WHERE "deleted_apps"."id" = "deleted_app_first_seen"."id"
  AND "deleted_app_first_seen"."created_at" < "deleted_apps"."created_at";
