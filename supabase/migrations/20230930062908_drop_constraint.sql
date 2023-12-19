ALTER TABLE devices DROP CONSTRAINT devices_app_id_fkey;

CREATE FUNCTION on_app_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    DELETE FROM "devices" where app_id=OLD.app_id;
    DELETE FROM "stats" where app_id=OLD.app_id;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE FUNCTION on_app_version_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    DELETE FROM "devices" where app_id=OLD.app_id and version=OLD.id;
    DELETE FROM "stats" where app_id=OLD.app_id and version=OLD.id;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION on_device_delete_sql() RETURNS TRIGGER AS $_$
BEGIN
    DELETE FROM "stats" where app_id=OLD.app_id and device_id=OLD.device_id;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE TRIGGER on_app_delete_sql 
BEFORE DELETE ON apps 
FOR EACH ROW 
EXECUTE PROCEDURE on_app_delete_sql();

CREATE TRIGGER on_app_versions_delete_sql 
BEFORE DELETE ON app_versions 
FOR EACH ROW 
EXECUTE PROCEDURE on_app_version_delete_sql();

CREATE TRIGGER on_device_delete_sql 
BEFORE DELETE ON devices 
FOR EACH ROW 
EXECUTE PROCEDURE on_device_delete_sql();
