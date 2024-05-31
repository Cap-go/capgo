ALTER TABLE apikeys
ADD COLUMN name varchar;

UPDATE apikeys
set name=format('Apikey %s', apikeys.id);

ALTER TABLE apikeys
ALTER COLUMN name SET NOT NULL;

CREATE OR REPLACE FUNCTION "public"."auto_apikey_name_by_id"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  AS $$BEGIN

  IF (NEW.name IS NOT DISTINCT FROM NULL) OR LENGTH(NEW.name) = 0 THEN
    NEW.name = format('Apikey %s', NEW.id);
  END IF;

  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER "force_valid_apikey_name" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."auto_apikey_name_by_id"();