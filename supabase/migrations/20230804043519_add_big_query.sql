-- create extension if not exists wrappers;

-- create foreign data wrapper bigquery_wrapper
--   handler big_query_fdw_handler
--   validator big_query_fdw_validator;

-- -- create service account with AI Platform Service Agent role
-- --  create table in bigquery ( do not enable partitioning )
-- -- created_at:TIMESTAMP,
-- -- action:STRING,
-- -- device_id:STRING,
-- -- version_build:STRING,
-- -- version:INTEGER,
-- -- app_id:STRING
-- -- create table your_project_id.your_dataset_id.stats (
-- --   created_at timestamp,
-- --   action text,
-- --   device_id text,
-- --   version_build text,
-- --   version integer,
-- --   app_id text
-- -- );

-- create server bigquery_server
--   foreign data wrapper bigquery_wrapper
--   options (
--     sa_key '
--     {
--        "type": "service_account",
--        "project_id": "your_gcp_project_id",
--        ...
--     }
--    ',
--     project_id 'your_gcp_project_id',
--     dataset_id 'your_gcp_dataset_id'
--   );

-- create foreign table bigquery.stats (
--   created_at timestamp,
--   action text,
--   device_id text,
--   version_build text,
--   version integer,
--   app_id text
-- )
--   server bigquery_server
--   options (
--     table 'stats',
--     location 'EU'
--   );

-- --  to insert in bigquery to test
-- -- INSERT INTO
-- --   your_gcp_project_id.your_gcp_dataset_id.stats(created_at,action,device_id,version_build,version,app_id)
-- -- VALUES
-- --   (CURRENT_TIMESTAMP(), 'test', 'device_1', '1.0.0', 42, 'capgo.app'),
-- --   (CURRENT_TIMESTAMP(), 'test', 'device_2', '1.0.0', 43, 'capgo.app'),
-- --   (CURRENT_TIMESTAMP(), 'test', 'device_3', '1.0.0', 44, 'capgo.app');

-- select * from bigquery.stats limit 10; -- to test
