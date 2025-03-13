-- Add link and comment columns to app_versions table
ALTER TABLE "public"."app_versions" 
ADD COLUMN IF NOT EXISTS "link" text,
ADD COLUMN IF NOT EXISTS "comment" text;
