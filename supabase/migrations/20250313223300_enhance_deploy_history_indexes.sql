-- Enhance deploy_history indexes with composite indexes for common query patterns

-- Composite index for channel_id and app_id (common filter combination)
CREATE INDEX IF NOT EXISTS deploy_history_channel_app_idx ON "public"."deploy_history" (channel_id, app_id);

-- Composite index for channel_id and deployed_at (common filter + sort)
CREATE INDEX IF NOT EXISTS deploy_history_channel_deployed_at_idx ON "public"."deploy_history" (channel_id, deployed_at DESC);

-- Composite index for app_id and deployed_at (common filter + sort)
CREATE INDEX IF NOT EXISTS deploy_history_app_deployed_at_idx ON "public"."deploy_history" (app_id, deployed_at DESC);

-- Full text search index on version name for efficient searching
ALTER TABLE "public"."app_versions" ADD COLUMN IF NOT EXISTS name_search tsvector 
GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, ''))) STORED;

CREATE INDEX IF NOT EXISTS app_versions_name_search_idx ON "public"."app_versions" USING GIN (name_search);
