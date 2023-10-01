CREATE TYPE "public"."disable_update" AS ENUM (
    'major',
    'minor',
    'version_number',
    'none'
);

ALTER TABLE "public"."channels"
ADD COLUMN "disableAutoUpdate" "public"."disable_update" not null default 'major'::"public"."disable_update";

UPDATE "public"."channels"
SET "disableAutoUpdate"=(case when (channels."disableAutoUpdateToMajor" = true) then 'major'::"public"."disable_update" else 'none'::"public"."disable_update" end);

ALTER TABLE "public"."channels"
DROP COLUMN "disableAutoUpdateToMajor";