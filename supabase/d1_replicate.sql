-- Create app_versions table
CREATE TABLE IF NOT EXISTS app_versions (
    id INTEGER PRIMARY KEY NOT NULL,
    owner_org TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bucket_id TEXT,
    r2_path TEXT,
    user_id TEXT,
    updated_at INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    external_url TEXT,
    checksum TEXT,
    session_key TEXT,
    storage_provider TEXT DEFAULT 'r2' NOT NULL,
    min_update_version TEXT,
    manifest JSON
);

-- Create devices_override table
CREATE TABLE IF NOT EXISTS devices_override (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    device_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    owner_org TEXT NOT NULL
);

-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL,
    name TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by TEXT,
    owner_org TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    public BOOLEAN NOT NULL DEFAULT FALSE,
    disable_auto_update_under_native BOOLEAN NOT NULL DEFAULT TRUE,
    disable_auto_update TEXT NOT NULL DEFAULT 'major' CHECK(disable_auto_update IN ('major', 'minor', 'version_number', 'none')),
    enable_ab_testing BOOLEAN NOT NULL DEFAULT FALSE,
    enable_progressive_deploy BOOLEAN NOT NULL DEFAULT FALSE,
    secondary_version_percentage REAL NOT NULL DEFAULT 0,
    second_version INTEGER,
    beta BOOLEAN NOT NULL DEFAULT FALSE,
    ios BOOLEAN NOT NULL DEFAULT TRUE,
    android BOOLEAN NOT NULL DEFAULT TRUE,
    allow_device_self_set BOOLEAN NOT NULL DEFAULT FALSE,
    allow_emulator BOOLEAN NOT NULL DEFAULT TRUE,
    allow_dev BOOLEAN NOT NULL DEFAULT TRUE
);

-- Create channel_devices table
CREATE TABLE IF NOT EXISTS channel_devices (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    channel_id INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL NOT NULL,
    device_id TEXT NOT NULL,
    owner_org TEXT NOT NULL
);

-- Create apps table
CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    icon_url TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT UNIQUE,
    last_version TEXT,
    updated_at INTEGER,
    retention INTEGER DEFAULT 2592000 NOT NULL,
    owner_org TEXT NOT NULL,
    default_upload_channel TEXT
);

-- Create orgs table
CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    logo TEXT,
    name TEXT NOT NULL,
    management_email TEXT NOT NULL,
    customer_id TEXT
);

-- Indexes for app_versions table
CREATE INDEX IF NOT EXISTS idx_app_versions_name ON app_versions(name);
CREATE INDEX IF NOT EXISTS idx_app_versions_app_id ON app_versions(app_id);

-- Indexes for devices_override table
CREATE INDEX IF NOT EXISTS idx_devices_override_device_id_app_id ON devices_override(device_id, app_id);

-- Indexes for channels table
CREATE INDEX IF NOT EXISTS idx_channels_app_id_public_android_ios ON channels(app_id, public, android, ios);
CREATE INDEX IF NOT EXISTS idx_channels_app_id_name ON channels(app_id, name);

-- Indexes for channel_devices table
CREATE INDEX IF NOT EXISTS idx_channel_devices_device_id_app_id ON channel_devices(device_id, app_id);

-- Indexes for apps table
CREATE INDEX IF NOT EXISTS idx_apps_app_id ON apps(app_id);

-- Indexes for orgs table
CREATE INDEX IF NOT EXISTS idx_orgs_id ON orgs(id);

-- -- drop all tables;
-- DROP TABLE IF EXISTS app_versions;
-- DROP TABLE IF EXISTS devices_override;
-- DROP TABLE IF EXISTS channels;
-- DROP TABLE IF EXISTS channel_devices;
-- DROP TABLE IF EXISTS apps;
-- DROP TABLE IF EXISTS orgs;

-- count each
-- SELECT COUNT(*) FROM app_versions;
-- SELECT COUNT(*) FROM devices_override;
-- SELECT COUNT(*) FROM channels;
-- SELECT COUNT(*) FROM channel_devices;
-- SELECT COUNT(*) FROM apps;
-- SELECT COUNT(*) FROM orgs;
