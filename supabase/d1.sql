
CREATE TABLE IF NOT EXISTS stats (
    "created_at" timestamp with time zone NOT NULL,
    "action" character varying(36) NOT NULL,
    "device_id" character varying(36) NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying(50) NOT NULL
);

CREATE INDEX "idx_stats_app_id_action" ON stats("app_id", "action");

CREATE INDEX "idx_stats_app_id_created_at" ON stats("app_id", "created_at");

CREATE INDEX "idx_stats_app_id_device_id" ON stats("app_id", "device_id");

CREATE INDEX "idx_stats_app_id_version" ON stats("app_id", "version");

-- DROP TABLE IF EXISTS devices;
CREATE TABLE IF NOT EXISTS devices (
    "updated_at" timestamp with time zone NOT NULL,
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying(50) NOT NULL,
    "platform" character varying(8) NOT NULL,
    "plugin_version" character varying(20) NOT NULL,
    "os_version" character varying(20) NOT NULL,
    "version_build" character varying(20) DEFAULT 'builtin',
    "custom_id" character varying(36) DEFAULT '' NOT NULL,
    "is_prod" boolean DEFAULT true,
    "is_emulator" boolean DEFAULT false,
    PRIMARY KEY ( app_id, device_id)
);

CREATE INDEX "devices_app_id_device_id_updated_at_idx" ON devices ("app_id", "device_id", "updated_at");

CREATE INDEX "devices_app_id_updated_at_idx" ON devices ("app_id", "updated_at");

CREATE INDEX "idx_app_id_created_at_devices" ON devices ("app_id", "updated_at");

CREATE INDEX "idx_app_id_version_devices" ON devices ("app_id", "version");
