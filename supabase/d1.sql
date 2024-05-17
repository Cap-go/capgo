

CREATE TABLE IF NOT EXISTS stats (
    "created_at" timestamp with time zone NOT NULL,
    "action" character varying(36) NOT NULL,
    "device_id" character varying(36) NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying(50) NOT NULL
);

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
    "is_emulator" boolean DEFAULT false
);
