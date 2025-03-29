ALTER TABLE "public"."app_versions" 
ADD COLUMN IF NOT EXISTS "name" text,
ADD COLUMN IF NOT EXISTS "description" text;
