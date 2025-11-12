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
    default_channel TEXT,
    version_build character varying(20) DEFAULT 'builtin',
    custom_id character varying(36) DEFAULT '' NOT NULL,
    is_prod boolean DEFAULT true,
    is_emulator boolean DEFAULT false,
    PRIMARY KEY (app_id, device_id)
);

CREATE INDEX devices_app_id_device_id_updated_at_idx ON devices (app_id, device_id, updated_at);

CREATE INDEX devices_app_id_updated_at_idx ON devices (app_id, updated_at);

CREATE INDEX idx_app_id_created_at_devices ON devices (app_id, updated_at);

CREATE INDEX idx_app_id_version_name_devices ON devices (app_id, version_name);
