CREATE TABLE IF NOT EXISTS stats (
    created_at timestamp with time zone NOT NULL,
    action character varying(36) NOT NULL,
    device_id character varying(36) NOT NULL,
    version bigint NOT NULL,
    version_name text NOT NULL DEFAULT 'unknown',
    app_id character varying(50) NOT NULL
);

CREATE INDEX idx_stats_app_id_action ON stats (app_id, action);

CREATE INDEX idx_stats_app_id_created_at ON stats (app_id, created_at);

CREATE INDEX idx_stats_app_id_device_id ON stats (app_id, device_id);

CREATE INDEX idx_stats_app_id_version_name ON stats (app_id, version_name);
