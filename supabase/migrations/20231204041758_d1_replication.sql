CREATE OR REPLACE FUNCTION public.post_replication_sql(sql_query text) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  request_id text;
BEGIN 
  SELECT INTO request_id net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'd1_http_url'),
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      (select format('Bearer %s', (select decrypted_secret from vault.decrypted_secrets where name = 'd1_cf_apikey')))
    ),
    body := jsonb_build_object(
      'sql',
      sql_query
    ),
    timeout_milliseconds := 15000
   );
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.post_replication_sql(sql_query text, params text[]) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  request_id text;
BEGIN 
  SELECT INTO request_id net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'd1_http_url'),
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      (select format('Bearer %s', (select decrypted_secret from vault.decrypted_secrets where name = 'd1_cf_apikey')))
    ),
    body := jsonb_build_object(
      'sql',
      sql_query,
      'params',
      params
    ),
    timeout_milliseconds := 15000
   );
END;
$BODY$;

-- with i as (
--   (select * from json_each_text((row_to_json((select ROW(apps.*) from apps limit 1)))))
-- )
-- select (select json_agg((CASE WHEN i.value != '' THEN (i.value) ELSE 'null' END)) from i)

CREATE OR REPLACE FUNCTION "public"."replicate_insert"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
BEGIN
  with i as (
      (select * from json_each_text((row_to_json(NEW))))
  )
  (select format('INSERT INTO %s ("%s") VALUES(''%s'')', TG_ARGV[0], (select string_agg(i.key, '", "') from i where i.value != ''), (select string_agg(i.value, ''', ''') from i where i.value != ''))) INTO sql_query;


  PERFORM post_replication_sql(sql_query);
  RETURN NEW;
END;$$;
-- update channels set "secondVersion"=null where id = 24
CREATE OR REPLACE FUNCTION "public"."replicate_update"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
BEGIN
    with i as (
        (select * from json_each_text((row_to_json(NEW))))
    )
    (select format('UPDATE %s SET %s WHERE %s="%s"', TG_ARGV[0], (select string_agg(format('"%s"=%s', i.key, (SELECT (CASE WHEN i.value != '' THEN (select format('''%s''', i.value)) ELSE 'NULL' END))), ', ') from i), TG_ARGV[1], (select i.value from i where i.key=TG_ARGV[1] limit 1))) INTO sql_query;


  PERFORM post_replication_sql(sql_query);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."replicate_drop"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
  filter_value text;
BEGIN
  EXECUTE format('SELECT ($1."%s")::text', TG_ARGV[1]) using OLD into filter_value;
  SELECT format ('DELETE FROM %s WHERE %s="%s"', TG_ARGV[0], TG_ARGV[1], filter_value) INTO sql_query;

  PERFORM post_replication_sql(sql_query);
  RETURN OLD;
END;$$;

CREATE OR REPLACE FUNCTION "public"."replicate_drop_double"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
  filter_value text;
  filter_value_two text;
BEGIN
  EXECUTE format('SELECT ($1."%s")::text', TG_ARGV[1]) using OLD into filter_value;
  EXECUTE format('SELECT ($1."%s")::text', TG_ARGV[2]) using OLD into filter_value_two;
  SELECT format ('DELETE FROM %s WHERE %s="%s" AND %s="%s"', TG_ARGV[0], TG_ARGV[1], filter_value, TG_ARGV[2], filter_value_two) INTO sql_query;

  PERFORM post_replication_sql(sql_query);
  RETURN OLD;
END;$$;

CREATE OR REPLACE FUNCTION "public"."replicate_update_double"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
BEGIN
    with i as (
        (select * from json_each_text((row_to_json(NEW))))
    )
    (select format('UPDATE %s SET %s WHERE %s="%s" AND %s="%s"', TG_ARGV[0], (select string_agg(format('"%s"=%s', i.key, (SELECT (CASE WHEN i.value != '' THEN (select format('''%s''', i.value)) ELSE 'NULL' END))), ', ') from i), TG_ARGV[1], (select i.value from i where i.key=TG_ARGV[1] limit 1), TG_ARGV[2], (select i.value from i where i.key=TG_ARGV[2] limit 1))) INTO sql_query;


  PERFORM post_replication_sql(sql_query);
  RETURN NEW;
END;$$;

-- EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD

CREATE TRIGGER replicate_channel_insert
   BEFORE INSERT ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_insert"('channels');

CREATE TRIGGER replicate_channel_update
   BEFORE UPDATE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update"('channels', 'id');

CREATE TRIGGER replicate_channel_drop
   BEFORE DELETE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_drop"('channels', 'id');

CREATE TRIGGER replicate_version_insert
   BEFORE INSERT ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_insert"('app_versions');

CREATE TRIGGER replicate_version_update
   BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update"('app_versions', 'id');

CREATE TRIGGER replicate_version_drop
   BEFORE DELETE ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_drop"('app_versions', 'id');

--
CREATE TRIGGER replicate_apps_insert
   BEFORE INSERT ON "public"."apps" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_insert"('apps');

CREATE TRIGGER replicate_apps_update
   BEFORE UPDATE ON "public"."apps" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update"('apps', 'app_id');

CREATE TRIGGER replicate_apps_drop
   BEFORE DELETE ON "public"."apps" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_drop"('apps', 'app_id');

--
CREATE TRIGGER replicate_channel_devices_insert
   BEFORE INSERT ON "public"."channel_devices" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_insert"('channel_devices');

CREATE TRIGGER replicate_channel_devices_update
   BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update_double"('channel_devices', 'device_id', 'app_id');

CREATE TRIGGER replicate_channel_devices_drop
   BEFORE DELETE ON "public"."channel_devices" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_drop_double"('channel_devices', 'device_id', 'app_id');

--
CREATE TRIGGER replicate_devices_override_insert
   BEFORE INSERT ON "public"."devices_override" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_insert"('devices_override');

CREATE TRIGGER replicate_devices_override_update
   BEFORE UPDATE ON "public"."devices_override" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update_double"('devices_override', 'device_id', 'app_id');

CREATE TRIGGER replicate_devices_override_drop
   BEFORE DELETE ON "public"."devices_override" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_drop_double"('devices_override', 'device_id', 'app_id');

-- with i as (
--   (select * from json_each_text((row_to_json((select ROW(apps.*) from apps limit 1)))))
-- )
-- select (select json_agg(i.value) from i)
-- INSERT INTO apps (id, created_at, name, app_id, version, created_by, updated_at, public, disableAutoUpdateUnderNative, enableAbTesting, enable_progressive_deploy, secondaryVersionPercentage, beta, ios, android, allow_device_self_set, allow_emulator, allow_dev, disableAutoUpdate) VALUES('22', '2023-12-04T04:31:09.255645+00:00', 'productionn', 'com.demo.app', '9654', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-12-04T06:41:27.420552+00:00', 'true', 'true', 'false', 'false', '0', 'false', 'false', 'true', 'true', 'true', 'true', 'major')
-- CREATE TRIGGER replicate_c
--    BEFORE UPDATE ON "public"."channels" FOR EACH ROW
--    EXECUTE PROCEDURE "public"."replicate"();

-- select * from json_each_text((row_to_json((select ROW(apps.*) from apps limit 1))))


--   with i as (
--     (select * from json_each_text((row_to_json((select ROW(apps.*) from apps limit 1)))))
--   )
  -- select format('INSERT INTO apps (%s) VALUES(%s)', (select string_agg(i.key, ', ') from i), (select string_agg(i.value, ', ') from i));


--     with i as (
--     (select * from json_each_text((row_to_json((select ROW(apps.*) from apps limit 1)))))
--   )
--   select format('INSERT INTO apps (%s) VALUES(''%s'')', (select string_agg(i.key, ', ') from i where i.value != ''), (select string_agg(i.value, ''', ''') from i where i.value != ''));


-- INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "user_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider") VALUES (floor(random() * 100000000), now(), 'com.demo.app', format('%s.%s.%s', floor(random()  * 100000000), floor(random()  * 100000000), floor(random()  * 100000000)), '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', NULL, '3885ee49', NULL, 'r2')