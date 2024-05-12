CREATE OR REPLACE FUNCTION "public"."prevent_steal_org"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
  IF (select current_user) IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;
  
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION '"created_by" must not be updated';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION '"id" must not be updated';
  END IF;

  RETURN NEW;
END;$$;