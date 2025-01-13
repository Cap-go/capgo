ALTER TABLE "public"."channels"
ADD COLUMN "delete_old_bundle_on_delete" boolean NOT NULL DEFAULT false;
