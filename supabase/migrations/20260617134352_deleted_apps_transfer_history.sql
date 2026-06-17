ALTER TABLE "public"."deleted_apps"
ADD COLUMN IF NOT EXISTS "transfer_history" jsonb[] DEFAULT '{}'::jsonb[];
