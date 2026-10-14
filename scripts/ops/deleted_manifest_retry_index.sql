-- Prebuild before migration 20261013151417 on databases with >10,000 versions.
-- Run this statement on its own, outside any transaction. If a previous build
-- failed, drop its invalid index before retrying.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_versions_deleted_manifest_retry
ON public.app_versions (updated_at ASC NULLS FIRST, id) WHERE deleted = true;
