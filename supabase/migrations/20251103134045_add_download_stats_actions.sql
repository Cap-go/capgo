-- Add new download stats actions to the stats_action enum
-- These actions track different stages of download (manifest/delta and full zip)
-- Success stats
ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'backend_refusal';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_manifest_start';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_manifest_complete';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_zip_start';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_zip_complete';

-- Failure stats (with filename in version_name as version:filename)
-- Example: version_name = '1.2.3:main.js' or '1.2.3:assets/logo.png'
ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_manifest_file_fail';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_manifest_checksum_fail';

ALTER TYPE "public"."stats_action"
ADD VALUE IF NOT EXISTS 'download_manifest_brotli_fail';
