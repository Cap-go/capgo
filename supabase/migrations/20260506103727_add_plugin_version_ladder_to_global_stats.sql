ALTER TABLE "public"."global_stats"
ADD COLUMN IF NOT EXISTS "plugin_version_ladder" jsonb DEFAULT '[]'::jsonb NOT NULL;
