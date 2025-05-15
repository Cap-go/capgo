-- Add missing indexes
CREATE INDEX idx_channels_app_id_name ON channels(app_id, name);
CREATE INDEX idx_channels_public_app_id ON channels(public, app_id);
CREATE INDEX idx_channels_public_app_id_android ON channels(public, app_id, android);
CREATE INDEX idx_channels_public_app_id_ios ON channels(public, app_id, ios);

--  Drop old indexes
DROP INDEX IF EXISTS idx_channels_public_app_id;
DROP INDEX IF EXISTS idx_channels_app_public_platform;
