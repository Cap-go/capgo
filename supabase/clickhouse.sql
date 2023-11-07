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

CREATE TABLE IF NOT EXISTS logs_daily
(
    date Date,
    app_id String,
    get_actions_count UInt64,
    fail_actions_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

CREATE MATERIALIZED VIEW logs_daily_mv
TO logs_daily
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    countIf(action = 'get') AS get_actions_count,
    countIf(action IN ('set_fail', 'update_fail', 'download_fail')) AS fail_actions_count
FROM logs
GROUP BY date, app_id;

-- 
-- App versions table
-- 

CREATE TABLE app_versions_meta
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

 Create stats for app_versions_meta

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

INSERT INTO app_storage_daily
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

drop table aggregate_daily;
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

drop table aggregate_daily_mv;
CREATE MATERIALIZED VIEW aggregate_daily_mv
TO aggregate_daily
AS
SELECT
    l.date,
    l.app_id,
    a.storage_added,
    a.storage_deleted,
    l.bandwidth,
    m.mau,
    l.get,
    l.fail,
    l.install,
    l.uninstall,
FROM logs_daily AS l
FULL JOIN app_storage_daily AS a ON l.date = a.date AND l.app_id = a.app_id
FULL JOIN mau AS m ON l.date = m.date AND l.app_id = m.app_id;

INSERT INTO aggregate_daily
SELECT
    l.date,
    l.app_id,
    a.storage_added,
    a.storage_deleted,
    l.bandwidth,
    m.mau,
    l.get,
    l.fail,
    l.install,
    l.uninstall,
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

INSERT INTO aggregate_monthly
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

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS avg_session_length;
DROP VIEW IF EXISTS mv_sessions;
DROP VIEW IF EXISTS mv_avg_session_length;

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

DROP TABLE IF EXISTS daily_aggregate_logs;
DROP TABLE IF EXISTS version_aggregate_logs;
DROP VIEW IF EXISTS daily_aggregate_logs_mv;
DROP VIEW IF EXISTS version_aggregate_logs_mv;
-- Aggregate table partitioned by day and version
-- Aggregate table partitioned by year and month
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
