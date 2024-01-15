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
    last_mau DateTime64(6)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(updated_at)
ORDER BY (app_id, device_id, updated_at)
PRIMARY KEY (app_id, device_id);

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
    total AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);
-- select date, app_id, sum(mau) as mau from mau_mv group by date, app_id
-- drop table mau_mv
-- select * from mau_mv

CREATE MATERIALIZED VIEW IF NOT EXISTS mau_mv
TO mau
AS
SELECT
    minDate AS date,
    app_id,
    uniqState(device_id) AS total
FROM
    (
    SELECT
        min(toDate(created_at)) AS minDate,
        app_id,
        device_id
    FROM logs
    WHERE 
        created_at >= toStartOfMonth(toDate(now())) 
        AND created_at < toStartOfMonth(toDate(now()) + INTERVAL 1 MONTH)
    GROUP BY device_id, app_id
    )
GROUP BY date, app_id;

-- Used to populate data in mau table
-- how to use:
-- 1) create the mau table
-- 2) make sure mau is empty
-- 3) execute this populate query
-- 4) execute the "CREATE MATERIALIZED VIEW IF NOT EXISTS mau_mv" from above 

-- INSERT INTO mau SELECT
--     minDate AS date,
--     app_id,
--     uniqState(device_id) AS mau
-- FROM
--     (
--     SELECT
--         min(toDate(created_at)) AS minDate,
--         app_id,
--         device_id
--     FROM logs
--     WHERE 
--         created_at >= toStartOfMonth(toDate(now())) 
--         AND created_at < toStartOfMonth(toDate(now()) + INTERVAL 1 MONTH)
--     GROUP BY device_id, app_id
--     )
-- GROUP BY date, app_id;

-- CREATE MATERIALIZED VIEW mau
-- ENGINE = MergeTree()

-- OPTIONAL TABLES

-- 
-- Sessions stats
-- 

-- CREATE TABLE IF NOT EXISTS sessions
-- (
--     device_id String,
--     app_id String,
--     session_start DateTime64(6),
--     session_end DateTime64(6)
-- ) ENGINE = ReplacingMergeTree()
-- ORDER BY (app_id, device_id, session_start)
-- PRIMARY KEY (app_id, device_id, session_start);

-- CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sessions
-- TO sessions AS
-- SELECT
--     device_id,
--     app_id,
--     anyIf(created_at, action = 'app_moved_to_foreground') as session_start,
--     anyIf(created_at, action = 'app_moved_to_background') as session_end
-- FROM logs
-- WHERE (action = 'app_moved_to_foreground' OR action = 'app_moved_to_background')
-- GROUP BY device_id, app_id
-- HAVING session_start < session_end;

-- CREATE TABLE IF NOT EXISTS avg_session_length
-- (
--     device_id String,
--     app_id String,
--     avg_length Float64
-- ) ENGINE = AggregatingMergeTree()
-- ORDER BY (app_id, device_id)
-- PRIMARY KEY (app_id, device_id);

-- CREATE MATERIALIZED VIEW IF NOT EXISTS mv_avg_session_length
-- TO avg_session_length AS
-- SELECT
--     device_id,
--     app_id,
--     avg(toUnixTimestamp(session_end) - toUnixTimestamp(session_start)) as avg_length
-- FROM sessions
-- GROUP BY device_id, app_id;


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

