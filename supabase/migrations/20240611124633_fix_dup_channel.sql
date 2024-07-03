ALTER TABLE "public"."channels"
ADD CONSTRAINT "unique_name_app_id" UNIQUE ("name", "app_id");
