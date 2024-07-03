CREATE OR REPLACE FUNCTION "public"."guard_r2_path"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF NEW."r2_path" is not distinct from NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.storage_provider is not distinct from 'r2-direct-partial' OR NEW.storage_provider is not distinct from 'r2-partial') AND NEW."r2_path" is not distinct from (select format('orgs/%s/apps/%s/%s/', NEW.owner_org, NEW.app_id, NEW.id)) THEN
    RETURN NEW;
  END IF;

  IF NEW."r2_path" is distinct from (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, NEW.app_id, NEW.id)) THEN
    RAISE EXCEPTION 'The expected r2_path is %', (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, NEW.app_id), NEW.id);
  END IF;

   RETURN NEW;
END;$$;

CREATE TYPE manifest_entry AS (
    file_name character varying,
    s3_path character varying,
    file_hash character varying
); 

ALTER TABLE app_versions ADD COLUMN 
manifest manifest_entry[];