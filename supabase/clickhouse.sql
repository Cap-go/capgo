CREATE TABLE IF NOT EXISTS devices
(
    updated_at DateTime64(6),
    device_id String,
    custom_id String,
    app_id String,
    platform String,
    plugin_version String,
    os_version String,
    version_build String,
    version Int64,
    is_prod UInt8,
    is_emulator UInt8,
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(updated_at)
ORDER BY (app_id, device_id, updated_at)
PRIMARY KEY (app_id, device_id);

CREATE TABLE IF NOT EXISTS devices_u
(
    created_at DateTime64(6),
    updated_at DateTime64(6),  -- This column is used to determine the latest record
    device_id String,
    custom_id String,
    app_id String,
    platform String,
    plugin_version String,
    os_version String,
    version_build String,
    version Int64,
    is_prod UInt8,
    is_emulator UInt8,
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(updated_at)
ORDER BY (device_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS devices_u_mv
TO devices_u
AS
SELECT
    argMin(updated_at, updated_at) AS created_at,  -- Get the earliest updated_at as created_at
    device_id,
    argMax(custom_id, updated_at) AS custom_id,
    argMax(app_id, updated_at) AS app_id,
    argMax(platform, updated_at) AS platform,
    argMax(plugin_version, updated_at) AS plugin_version,
    argMax(os_version, updated_at) AS os_version,
    argMax(version_build, updated_at) AS version_build,
    argMax(version, updated_at) AS version,
    argMax(is_prod, updated_at) AS is_prod,
    argMax(is_emulator, updated_at) AS is_emulator
FROM devices
GROUP BY device_id;

CREATE TABLE IF NOT EXISTS logs
(
    created_at DateTime64(6),
    device_id String,
    app_id String,
    platform String,
    action String,
    version_build String,
    version Int64
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (app_id, device_id, created_at)
PRIMARY KEY (app_id, device_id, created_at);

CREATE TABLE IF NOT EXISTS logs_daily
(
    date Date,
    app_id String,
    version UInt64, -- This column is used to determine the latest record
    get UInt64,
    fail UInt64,
    install UInt64,
    uninstall UInt64,
    bandwidth Int64
) ENGINE = ReplacingMergeTree(version) -- Specify the version column for deduplication
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_daily_mv
TO logs_daily
AS
SELECT
    toDate(l.created_at) AS date,
    l.app_id,
    -- Use the maximum created_at as the version for each app_id and date
    max(l.created_at) AS version,
    countIf(l.action = 'get') AS get,
    countIf(l.action IN ('set_fail', 'update_fail', 'download_fail')) AS fail,
    countIf(l.action = 'set') AS install,
    countIf(l.action = 'uninstall') AS uninstall,
    -- Calculate the bandwidth
    sum(if(l.action = 'get', a.size, 0)) AS bandwidth
FROM logs AS l
LEFT JOIN app_versions_meta AS a ON l.app_id = a.app_id AND l.version = a.id
GROUP BY date, l.app_id;

CREATE TABLE IF NOT EXISTS mau
(
    date Date,
    app_id String,
    mau UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

CREATE MATERIALIZED VIEW mau_mv
TO mau
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    countDistinctIf(device_id, created_at >= toStartOfMonth(date) AND created_at < toStartOfMonth(date + INTERVAL 1 MONTH)) AS mau
FROM logs
GROUP BY date, app_id;

INSERT INTO mau
SELECT
    toDate(created_at) AS date,
    app_id,
    countDistinctIf(device_id, created_at >= toStartOfMonth(date) AND created_at < toStartOfMonth(date + INTERVAL 1 MONTH)) AS mau
FROM logs
GROUP BY date, app_id;

CREATE TABLE IF NOT EXISTS app_versions_meta
(
    created_at DateTime64(6),
    app_id String,
    size Int64,
    id Int64,
    action String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (id, app_id, action)
PRIMARY KEY (id, app_id, action);

CREATE TABLE IF NOT EXISTS app_storage_daily
(
    date Date,
    app_id String,
    storage_added Int64,
    storage_deleted Int64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

CREATE MATERIALIZED VIEW app_storage_daily_mv
TO app_storage_daily
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    sumIf(size, action = 'add') AS storage_added,
    sumIf(size, action = 'delete') AS storage_deleted
FROM app_versions_meta
GROUP BY date, app_id;

