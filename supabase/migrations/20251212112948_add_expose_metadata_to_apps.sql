-- Add expose_metadata column to apps table
-- When true, link and comment fields are exposed to the plugin
-- Default: false for security/privacy
ALTER TABLE apps
ADD COLUMN IF NOT EXISTS expose_metadata boolean DEFAULT false NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN apps.expose_metadata IS 'When true, bundle link and comment metadata are exposed to the plugin in update responses';
