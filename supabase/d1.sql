
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

CREATE TABLE store_apps (
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "app_id" VARCHAR(50) NOT NULL,
    "url" VARCHAR(256) NOT NULL,
    "title" VARCHAR(256) DEFAULT '' NOT NULL,
    "summary" VARCHAR(256) DEFAULT '' NOT NULL,
    "icon" VARCHAR(256) DEFAULT '' NOT NULL,
    "free" BOOLEAN DEFAULT true NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "capacitor" BOOLEAN DEFAULT false NOT NULL,
    "developer_email" VARCHAR(256) DEFAULT '' NOT NULL,
    "installs" INTEGER DEFAULT 0 NOT NULL,
    "developer" VARCHAR(50) NOT NULL,
    "score" REAL DEFAULT 0.0 NOT NULL,
    "to_get_framework" BOOLEAN DEFAULT true NOT NULL,
    "onprem" BOOLEAN DEFAULT false NOT NULL,
    "updates" INTEGER DEFAULT 0 NOT NULL,
    "to_get_info" BOOLEAN DEFAULT true NOT NULL,
    "to_get_similar" BOOLEAN DEFAULT true NOT NULL,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cordova" BOOLEAN DEFAULT false NOT NULL,
    "react_native" BOOLEAN DEFAULT false NOT NULL,
    "capgo" BOOLEAN DEFAULT false NOT NULL,
    "kotlin" BOOLEAN DEFAULT false NOT NULL,
    "flutter" BOOLEAN DEFAULT false NOT NULL,
    "native_script" BOOLEAN DEFAULT false NOT NULL,
    "lang" VARCHAR(50),
    "developer_id" VARCHAR(50),
    PRIMARY KEY (app_id)
);

CREATE INDEX "idx_store_apps" ON store_apps ("capacitor");

CREATE INDEX "idx_store_apps_capacitor" ON store_apps ("capacitor", "installs" DESC);

CREATE INDEX "idx_store_apps_cordova" ON store_apps ("cordova", "capacitor", "installs" DESC);

CREATE INDEX "idx_store_apps_flutter" ON store_apps ("flutter", "installs" DESC);

CREATE INDEX "idx_store_apps_install" ON store_apps ("capacitor", "installs");

CREATE INDEX "idx_store_apps_kotlin" ON store_apps ("kotlin", "installs" DESC);

CREATE INDEX "idx_store_apps_native_script" ON store_apps ("native_script", "installs" DESC);

CREATE INDEX "idx_store_apps_react_native" ON store_apps ("react_native", "installs" DESC);

CREATE INDEX "idx_store_capgo" ON store_apps ("capgo");

CREATE INDEX "idx_store_on_prem" ON store_apps ("onprem");

CREATE UNIQUE INDEX "store_app_pkey" ON store_apps ("app_id");
