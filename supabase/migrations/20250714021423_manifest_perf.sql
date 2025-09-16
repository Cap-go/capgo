-- Add composite index for manifest table performance optimization
-- This index optimizes queries that filter by file_name, file_hash, and app_version_id
-- which is used in the deleteManifest function to check for duplicate files
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_manifest_file_name_hash_version" ON "public"."manifest" USING "btree" ("file_name", "file_hash", "app_version_id");

-- This index will significantly improve performance for queries like:
-- SELECT * FROM manifest WHERE file_name = ? AND file_hash = ? AND app_version_id <> ?
