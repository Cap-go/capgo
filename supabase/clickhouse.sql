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

CREATE TABLE IF NOT EXISTS devices_aggregate
(
    created_at DateTime64(6),
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
    is_emulator UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(updated_at)
ORDER BY (app_id, device_id, updated_at)
PRIMARY KEY (app_id, device_id);

CREATE MATERIALIZED VIEW devices_aggregate_mv
TO devices_aggregate
AS
SELECT
    (select min(updated_at) from devices) AS created_at,
    (select max(updated_at) from devices) AS updated_at,
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
    version Int64,
    get UInt64,
    fail UInt64,
    install UInt64,
    uninstall UInt64,
    bandwidth Int64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id, version);

CREATE MATERIALIZED VIEW logs_daily_mv
TO logs_daily
AS
SELECT
    toDate(l.created_at) AS date,
    l.app_id,
    l.version,
    countIf(l.action = 'get') AS get,
    countIf(l.action IN ('set_fail', 'update_fail', 'download_fail')) AS fail,
    countIf(l.action = 'set') AS install,
    countIf(l.action = 'uninstall') AS uninstall,
    countIf(l.action = 'get') * maxIf(a.size, a.action = 'add') AS bandwidth
FROM logs AS l
LEFT JOIN app_versions_meta AS a ON l.app_id = a.app_id AND l.version = a.id
GROUP BY date, l.app_id, l.version;

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

-- 
-- Stats aggregation
-- 

-- drop table aggregate_daily;
CREATE TABLE IF NOT EXISTS aggregate_daily
(
    date Date,
    app_id String,
    storage_added Int64,
    storage_deleted Int64,
    bandwidth Int64,
    mau UInt64,
    get UInt64,
    fail UInt64,
    install UInt64,
    uninstall UInt64,
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

-- Recreate the aggregate_daily Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS aggregate_daily_mv
TO aggregate_daily
AS
SELECT
    l.date as date,
    l.app_id as app_id,
    a.storage_added as storage_added,
    a.storage_deleted as storage_deleted,
    l.bandwidth as bandwidth,
    m.count AS mau, -- Use the actual column name from the mau table
    l.get as get,
    l.fail as fail,
    l.install as install,
    l.uninstall as uninstall
FROM logs_daily AS l
FULL JOIN app_storage_daily AS a ON l.date = a.date AND l.app_id = a.app_id
FULL JOIN mau AS m ON l.date = m.date AND l.app_id = m.app_id;

CREATE TABLE IF NOT EXISTS aggregate_monthly
(
    month Date,
    app_id String,
    storage_added Int64,
    storage_deleted Int64,
    bandwidth Int64,
    mau UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(month)
ORDER BY (month, app_id);

CREATE MATERIALIZED VIEW aggregate_monthly_mv
TO aggregate_monthly
AS
SELECT
    toStartOfMonth(date) AS month,
    app_id,
    sum(storage_added) AS storage_added,
    sum(storage_deleted) AS storage_deleted,
    sum(bandwidth) AS bandwidth,
    max(mau) AS mau
FROM aggregate_daily
GROUP BY month, app_id;

-- 
-- Sessions stats
-- 

CREATE TABLE IF NOT EXISTS sessions
(
    device_id String,
    app_id String,
    session_start DateTime64(6),
    session_end DateTime64(6)
) ENGINE = ReplacingMergeTree()
ORDER BY (app_id, device_id, session_start)
PRIMARY KEY (app_id, device_id, session_start);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sessions
TO sessions AS
SELECT
    device_id,
    app_id,
    anyIf(created_at, action = 'app_moved_to_foreground') as session_start,
    anyIf(created_at, action = 'app_moved_to_background') as session_end
FROM logs
WHERE (action = 'app_moved_to_foreground' OR action = 'app_moved_to_background')
GROUP BY device_id, app_id
HAVING session_start < session_end;

CREATE TABLE IF NOT EXISTS avg_session_length
(
    device_id String,
    app_id String,
    avg_length Float64
) ENGINE = AggregatingMergeTree()
ORDER BY (app_id, device_id)
PRIMARY KEY (app_id, device_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_avg_session_length
TO avg_session_length AS
SELECT
    device_id,
    app_id,
    avg(toUnixTimestamp(session_end) - toUnixTimestamp(session_start)) as avg_length
FROM sessions
GROUP BY device_id, app_id;


-- 
-- Install and fail stats
-- 

CREATE TABLE IF NOT EXISTS daily_aggregate_logs
(
    date Date,
    version Int64,
    total_installs Int64,
    total_failures Int64,
    unique_devices Int64,
    install_percent Float64,
    failure_percent Float64
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, version);

CREATE TABLE IF NOT EXISTS version_aggregate_logs
(
    version Int64,
    total_installs Int64,
    total_failures Int64,
    unique_devices Int64,
    install_percent Float64,
    failure_percent Float64
) ENGINE = AggregatingMergeTree()
PARTITION BY version
ORDER BY version;

CREATE MATERIALIZED VIEW daily_aggregate_logs_mv TO daily_aggregate_logs AS
SELECT 
    toDate(created_at) AS date,
    version,
    countIf(action = 'set') AS total_installs,
    countIf(action IN ('set_fail', 'update_fail', 'download_fail')) AS total_failures,
    uniq(device_id) AS unique_devices,
    total_installs / unique_devices * 100 AS install_percent,
    total_failures / unique_devices * 100 AS failure_percent
FROM logs
GROUP BY date, version;

CREATE MATERIALIZED VIEW version_aggregate_logs_mv TO version_aggregate_logs AS
SELECT 
    version,
    countIf(action = 'set') AS total_installs,
    countIf(action IN ('set_fail', 'update_fail', 'download_fail')) AS total_failures,
    uniq(device_id) AS unique_devices,
    total_installs / unique_devices * 100 AS install_percent,
    total_failures / unique_devices * 100 AS failure_percent
FROM logs
GROUP BY version;

CREATE TABLE IF NOT EXISTS mau
(
    date Date,
    app_id String,
    count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

-- Recreate the mau Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS mau_mv
TO mau
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    countDistinct(device_id) AS count
FROM logs
WHERE created_at >= toStartOfMonth(date) AND created_at < toStartOfMonth(date + INTERVAL 1 MONTH)
GROUP BY date, app_id;
