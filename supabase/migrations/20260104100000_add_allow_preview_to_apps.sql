-- Add allow_preview column to apps table
-- When true, bundle preview is enabled for this app

ALTER TABLE apps
ADD COLUMN IF NOT EXISTS allow_preview boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN apps.allow_preview IS 'When true, bundle preview is enabled for this app';
