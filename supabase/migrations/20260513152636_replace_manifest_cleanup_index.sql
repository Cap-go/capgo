-- Keep the manifest cleanup lookup indexed without carrying the app_version_id
-- suffix from the old index. The cleanup path filters by file_hash and
-- file_name only when checking whether a deleted manifest object is still
-- referenced by another version.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manifest_file_hash
ON public.manifest USING btree (file_hash);

-- Supabase applies migrations through a pipeline that rejects DROP INDEX
-- CONCURRENTLY, so this drop intentionally uses the regular form.
DROP INDEX IF EXISTS public.idx_manifest_file_name_hash_version;
