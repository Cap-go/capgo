CREATE TABLE store_apps (
    created_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
    app_id varchar(50) NOT NULL,
    url varchar(256) DEFAULT '' NOT NULL,
    title varchar(256) DEFAULT '' NOT NULL,
    summary varchar(256) DEFAULT '' NOT NULL,
    icon varchar(256) DEFAULT '' NOT NULL,
    free boolean DEFAULT true NOT NULL,
    category varchar(50) DEFAULT '' NOT NULL,
    capacitor boolean DEFAULT false NOT NULL,
    developer_email varchar(256) DEFAULT '' NOT NULL,
    installs integer DEFAULT 0 NOT NULL,
    developer varchar(50) DEFAULT '' NOT NULL,
    score real DEFAULT 0.0 NOT NULL,
    to_get_framework boolean DEFAULT true NOT NULL,
    onprem boolean DEFAULT false NOT NULL,
    updates integer DEFAULT 0 NOT NULL,
    to_get_info boolean DEFAULT true NOT NULL,
    to_get_similar boolean DEFAULT true NOT NULL,
    updated_at datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cordova boolean DEFAULT false NOT NULL,
    react_native boolean DEFAULT false NOT NULL,
    capgo boolean DEFAULT false NOT NULL,
    kotlin boolean DEFAULT false NOT NULL,
    flutter boolean DEFAULT false NOT NULL,
    native_script boolean DEFAULT false NOT NULL,
    lang varchar(50) DEFAULT '' NOT NULL,
    developer_id varchar(50) DEFAULT '' NOT NULL,
    PRIMARY KEY (app_id)
);

CREATE INDEX idx_store_apps ON store_apps (capacitor);

CREATE INDEX idx_store_apps_capacitor ON store_apps (capacitor, installs DESC);

CREATE INDEX idx_store_apps_cordova ON store_apps (cordova, capacitor, installs DESC);

CREATE INDEX idx_store_apps_flutter ON store_apps (flutter, installs DESC);

CREATE INDEX idx_store_apps_install ON store_apps (capacitor, installs);

CREATE INDEX idx_store_apps_kotlin ON store_apps (kotlin, installs DESC);

CREATE INDEX idx_store_apps_native_script ON store_apps (native_script, installs DESC);

CREATE INDEX idx_store_apps_native_script_1 ON store_apps (native_script)
WHERE
    native_script = 1;

CREATE INDEX idx_store_apps_react_native ON store_apps (react_native, installs DESC);

CREATE INDEX idx_store_apps_c_c_installs_desc ON store_apps (cordova, capacitor, installs DESC);

CREATE INDEX idx_store_capgo ON store_apps (capgo);

CREATE INDEX idx_store_on_prem ON store_apps (onprem);

CREATE UNIQUE INDEX store_app_pkey ON store_apps (app_id);
