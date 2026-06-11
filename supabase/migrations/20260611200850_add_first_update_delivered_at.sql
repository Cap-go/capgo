ALTER TABLE "public"."apps" ADD COLUMN IF NOT EXISTS "first_update_delivered_at" timestamp with time zone;
