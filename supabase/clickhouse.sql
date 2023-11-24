-- 
-- Devices table
-- 

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

CREATE MATERIALIZED VIEW devices_aggregate_mv
TO devices_aggregate
AS
SELECT
    min(updated_at) AS created_at,
    max(updated_at) AS updated_at,
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

-- 
-- Logs table
--

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

-- 
-- App versions table
-- 

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

--  Create stats for app_versions_meta

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
-- MAU aggregation
-- 

CREATE TABLE IF NOT EXISTS mau
(
    date Date,
    app_id String,
    total UInt64,
    version UInt64 -- This column is used to determine the latest record
) ENGINE = ReplacingMergeTree(version) -- Specify the version column for deduplication
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

-- Recreate the mau_mv materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mau_mv
TO mau
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    countDistinct(device_id) AS total,
    maxState(created_at) AS version -- Use the maximum created_at as the version
FROM logs
GROUP BY date, app_id;

-- 
-- Stats aggregation
-- 

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

CREATE MATERIALIZED VIEW IF NOT EXISTS aggregate_daily_mv
TO aggregate_daily
AS
SELECT
    ld.date as date,
    ld.app_id as app_id,
    a.storage_added as storage_added,
    a.storage_deleted as storage_deleted,
    ld.bandwidth as bandwidth,
    -- Get the MAU value for each app_id and date
    m.total AS mau,
    ld.get as get,
    ld.fail as fail,
    ld.install as install,
    ld.uninstall as uninstall
FROM logs_daily AS ld
FULL JOIN app_storage_daily AS a ON ld.date = a.date AND ld.app_id = a.app_id
LEFT JOIN mau AS m ON ld.date = m.date AND ld.app_id = m.app_id
GROUP BY ld.date, ld.app_id, a.storage_added, a.storage_deleted, ld.bandwidth, m.total, ld.get, ld.fail, ld.install, ld.uninstall;


-- OPTIONAL TABLES

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

-- Aggregate table partitioned by version only
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

-- Create a Materialized View that aggregates data daily
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

-- Create a Materialized View that aggregates data by version
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

