CREATE OR REPLACE FUNCTION "public"."noupdate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    val RECORD;
    is_diffrent boolean;
BEGIN
    -- API key? We do not care
    IF (select auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF check_min_rights('admin'::user_min_right, (select auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    for val in
      select * from json_each_text(row_to_json(NEW))
    loop
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD
      INTO is_diffrent;

      IF is_diffrent AND val.key <> 'version' AND val.key <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    end loop;

   RETURN NEW;
END;$_$;
