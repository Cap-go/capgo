-- Add app-level toggle to block provider infrastructure IP traffic
-- on plugin endpoints.
-- Default is enabled to keep existing behavior for existing apps.

ALTER TABLE apps
ADD COLUMN IF NOT EXISTS block_provider_infra_requests boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN apps.block_provider_infra_requests IS
  'When true (default), /updates, /stats, and /channel_self block known Google/Apple infrastructure IPs.';
