CREATE OR REPLACE FUNCTION "public"."replicate_insert"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
BEGIN
    with i as (
        (select * from json_each_text((row_to_json(NEW))))
    )
    (select format('INSERT INTO channels ("%s") VALUES(''%s'')', (select string_agg(i.key, '", "') from i where i.value != ''), (select string_agg(i.value, ''', ''') from i where i.value != ''))) INTO sql_query;


  SELECT INTO request_id net.http_post(
    url := 'http://2.tcp.eu.ngrok.io:15154',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json'
    ),
    body := jsonb_build_object(
      'sql',
      sql_query
    ),
    timeout_milliseconds := 15000
   );
   RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."replicate_update"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  sql_query character varying;
  request_id text;
BEGIN
    with i as (
        (select * from json_each_text((row_to_json(NEW))))
    )
    (select format('UPDATE %s SET %s', TG_ARGV[0], (select string_agg(format('"%s"=''%s''', i.key, i.value), ', ') from i where i.value != ''))) INTO sql_query;


    RAISE EXCEPTION 'not allowed %', sql_query;

  -- SELECT INTO request_id net.http_post(
  --   url := 'http://2.tcp.eu.ngrok.io:15154',
  --   headers := jsonb_build_object(
  --     'Content-Type',
  --     'application/json'
  --   ),
  --   body := jsonb_build_object(
  --     'sql',
  --     sql_query
  --   ),
  --   timeout_milliseconds := 15000
  --  );
  --  RETURN NEW;
END;$$;


CREATE TRIGGER replicate_c
   BEFORE UPDATE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."replicate_update"();


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