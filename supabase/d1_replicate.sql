-- Create app_versions table
CREATE TABLE IF NOT EXISTS app_versions (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bucket_id TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE NOT NULL,
    external_url TEXT,
    checksum TEXT,
    session_key TEXT,
    storage_provider TEXT DEFAULT 'r2' NOT NULL,
    minUpdateVersion TEXT,
    native_packages TEXT,
    owner_org TEXT NOT NULL,
    user_id TEXT,
    r2_path TEXT
);

-- Create devices_override table
CREATE TABLE IF NOT EXISTS devices_override (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    device_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    owner_org TEXT NOT NULL
);

-- Create channels table
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    public BOOLEAN DEFAULT FALSE NOT NULL,
    disableAutoUpdateUnderNative BOOLEAN DEFAULT TRUE NOT NULL,
    enableAbTesting BOOLEAN DEFAULT FALSE NOT NULL,
    enable_progressive_deploy BOOLEAN DEFAULT FALSE NOT NULL,
    secondaryVersionPercentage REAL DEFAULT 0 NOT NULL,
    secondVersion INTEGER,
    beta BOOLEAN DEFAULT FALSE NOT NULL,
    ios BOOLEAN DEFAULT TRUE NOT NULL,
    android BOOLEAN DEFAULT TRUE NOT NULL,
    allow_device_self_set BOOLEAN DEFAULT FALSE NOT NULL,
    allow_emulator BOOLEAN DEFAULT TRUE NOT NULL,
    allow_dev BOOLEAN DEFAULT TRUE NOT NULL,
    disableAutoUpdate TEXT DEFAULT 'major' NOT NULL,
    owner_org TEXT NOT NULL,
    created_by TEXT
);

-- Create channel_devices table
CREATE TABLE IF NOT EXISTS channel_devices (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    channel_id INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    device_id TEXT NOT NULL,
    owner_org TEXT NOT NULL
);

-- Create apps table
CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    app_id TEXT NOT NULL,
    icon_url TEXT NOT NULL,
    user_id TEXT,
    name TEXT,
    last_version TEXT,
    updated_at TIMESTAMP,
    retention INTEGER DEFAULT 2592000 NOT NULL,
    owner_org TEXT NOT NULL
);

-- Create orgs table
CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logo TEXT,
    name TEXT NOT NULL,
    management_email TEXT NOT NULL,
    customer_id TEXT
);

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    updated_at TIMESTAMP NOT NULL,
    version INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    platform TEXT,
    plugin_version TEXT DEFAULT '2.3.3' NOT NULL,
    os_version TEXT,
    version_build TEXT DEFAULT 'builtin',
    custom_id TEXT DEFAULT '' NOT NULL,
    is_prod BOOLEAN DEFAULT TRUE,
    is_emulator BOOLEAN DEFAULT FALSE
);
