CREATE OR REPLACE FUNCTION "public"."replicate"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
    new_record SETOF RECORD(key "TEXT", value "TEXT");
BEGIN
    select * from json_each_text((row_to_json(NEW))) INTO new_record;

    RAISE ERROR '%', new_record;

   RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."replicate"() RETURNS trigger
   LANGUAGE plpgsql AS $$
DECLARE
  aa character varying;
BEGIN
    with i as (
        (select * from json_each_text((row_to_json(NEW))))
    )
    (select format('INSERT INTO apps ("%s") VALUES(''%s'')', (select string_agg(i.key, '", "') from i where i.value != ''), (select string_agg(i.value, ''', ''') from i where i.value != ''))) INTO aa;

   raise exception '%', aa;
   RETURN NEW;
END;$$;

INSERT INTO apps (id, created_at, name, app_id, version, created_by, updated_at, public, disableAutoUpdateUnderNative, enableAbTesting, enable_progressive_deploy, secondaryVersionPercentage, beta, ios, android, allow_device_self_set, allow_emulator, allow_dev, disableAutoUpdate) VALUES('22', '2023-12-04T04:31:09.255645+00:00', 'productionn', 'com.demo.app', '9654', '6aa76066-55ef-4238-ade6-0b32334a4097', '2023-12-04T06:41:27.420552+00:00', 'true', 'true', 'false', 'false', '0', 'false', 'false', 'true', 'true', 'true', 'true', 'major')
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