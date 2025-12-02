-- DROP TABLE IF EXISTS devices;
CREATE TABLE IF NOT EXISTS devices (
    updated_at timestamp with time zone NOT NULL,
    device_id text NOT NULL,
    version bigint NOT NULL,
    version_name text,
    app_id character varying(50) NOT NULL,
    platform character varying(8) NOT NULL,
    plugin_version character varying(20) NOT NULL,
    os_version character varying(20) NOT NULL,
    default_channel text,
    version_build character varying(20) DEFAULT 'builtin',
    custom_id character varying(36) DEFAULT '' NOT NULL,
    is_prod boolean DEFAULT true,
    is_emulator boolean DEFAULT false,
    PRIMARY KEY (app_id, device_id)
);

CREATE INDEX devices_app_id_device_id_updated_at_idx ON devices (
    app_id, device_id, updated_at
);

-- Index for cursor-based pagination: ORDER BY updated_at DESC, device_id ASC
CREATE INDEX devices_app_id_updated_at_device_id_idx ON devices (app_id, updated_at DESC, device_id ASC);

CREATE INDEX idx_app_id_version_name_devices ON devices (app_id, version_name);

-- Device counts table for fast count queries
CREATE TABLE IF NOT EXISTS device_counts (
    app_id TEXT PRIMARY KEY,
    total_count INTEGER NOT NULL DEFAULT 0,
    custom_id_count INTEGER NOT NULL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
