-- This file contains instructions + sql code to setup clickhouse localy
-- please be advices - DO NOT use the default password, vault secret.id in prod
-- Instructiuons for local clickhouse setup:

--  1) Startup clickhouse using sh ./tests_backend/gh_actions/clickhouse.sh (requires docker)
--  2) Connect to clickhouse
--    2a) execute "cd /tmp"
--    2b) execute "curl https://clickhouse.com/ | sh"
--    2c) execute "./clickhouse client --host 127.0.0.1 --port 9000"
--  3) Copy and paste the "clickhouse.sql" into the client promt and execute
--  4) Connect to postgres and execute this file
--  5) add "CLICKHOUSE_URL=http://host.docker.internal:8123" into env varuables for supabase edge fns

create foreign data wrapper clickhouse_wrapper
  handler click_house_fdw_handler
  validator click_house_fdw_validator;


insert into vault.secrets (id, name, secret)
values (
  '29a9ca87-7777-4d2b-b7b6-28fd943f9619',
  'clickhouse',
  'tcp://default@host.docker.internal:9000/default?connection_timeout=30s&ping_before_query=false'
);

-- 29a9ca87-7777-4d2b-b7b6-28fd943f9619

create server clickhouse_server
  foreign data wrapper clickhouse_wrapper
  options (
    conn_string_id '29a9ca87-7777-4d2b-b7b6-28fd943f9619' -- The Key ID from above.
  );

create foreign table clickhouse_devices (
  created_at timestamp,
  updated_at timestamp,
  device_id text,
  custom_id text,
  app_id text,
  platform text,
  plugin_version text,
  os_version text,
  version_build text,
  version integer,
  is_prod boolean,
  is_emulator boolean
)
  server clickhouse_server
  options (
    table 'devices_u'
  );

-- DROP FOREIGN TABLE "public"."clickhouse_devices";
--  DROP FOREIGN TABLE "public"."clickhouse_app_usage";
-- https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/aggregatingmergetree

create foreign table clickhouse_app_usage (
  date date,
  app_id text,
  bandwidth bigint,
  mau bigint,
  get bigint,
  fail bigint,
  uninstall bigint,
  install bigint,
  storage_added bigint,
  storage_deleted bigint
)
server clickhouse_server
options (
  table '(SELECT DISTINCT ON (m.date,m.app_id) 
  m.date AS date,
  m.app_id AS app_id,
  uniqMerge(m.total) AS mau,
  COALESCE(l.get, 0) AS get,
  COALESCE(l.fail, 0) AS fail,
  COALESCE(l.install, 0) AS install,
  COALESCE(l.uninstall, 0) AS uninstall,
  COALESCE(l.bandwidth, 0) AS bandwidth,
  COALESCE(s.storage_added, 0) AS storage_added,
  COALESCE(s.storage_deleted, 0) AS storage_deleted
  FROM mau m
  LEFT JOIN logs_daily l ON m.date = l.date AND m.app_id = l.app_id
  LEFT JOIN app_storage_daily s ON l.date = s.date AND l.app_id = s.app_id
  group by m.app_id, m.date, l.get, l.install, l.uninstall, l.bandwidth, l.fail, s.storage_added, s.storage_deleted)'
);

-- select uniqMerge(mau), app_id, date from mau group by app_id, date;

create foreign table clickhouse_logs (
  created_at timestamp,
  device_id text,
  app_id text,
  platform text,
  action text,
  version_build text,
  version bigint
)
server clickhouse_server
options (
  table 'logs'
);


CREATE OR REPLACE FUNCTION public.get_total_storage_size(appid character varying, userid uuid)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.user_id = userid
    AND app_versions.app_id = appid
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

--clickhouse_app_usage
-- (SELECT DISTINCT ON (m.date,m.app_id) m.date AS date, m.app_id AS app_id, m.total AS mau, COALESCE(l.get, 0) AS get, COALESCE(l.fail, 0) AS fail, COALESCE(l.install, 0) AS install, COALESCE(l.uninstall, 0) AS uninstall, COALESCE(l.bandwidth, 0) AS bandwidth, COALESCE(s.storage_added, 0) AS storage_added, COALESCE(s.storage_deleted, 0) AS storage_deleted FROM mau m LEFT JOIN logs_daily l ON m.date = l.date AND m.app_id = l.app_id LEFT JOIN app_storage_daily s ON l.date = s.date AND l.app_id = s.app_id)
