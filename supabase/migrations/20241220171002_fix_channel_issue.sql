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

CREATE OR REPLACE PROCEDURE "public"."update_app_versions_retention"()
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE app_versions
    SET deleted = true
    where extract(epoch from now()) - extract(epoch from app_versions.created_at) > ((select retention from apps where app_id=app_versions.app_id))
    AND NOT EXISTS (
        SELECT 1
        FROM channels
        WHERE app_id = app_versions.app_id
          AND app_versions.id = channels.version
    );
END;
$$;
