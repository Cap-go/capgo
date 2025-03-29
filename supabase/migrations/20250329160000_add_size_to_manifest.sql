CREATE OR REPLACE FUNCTION migrate_manifest_entries()
RETURNS manifest_entry[] AS $$
DECLARE
    result manifest_entry[];
BEGIN
    CREATE TYPE manifest_entry AS (
        file_name character varying,
        s3_path character varying,
        file_hash character varying,
        file_size bigint
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

DROP TYPE IF EXISTS manifest_entry CASCADE;

CREATE TYPE manifest_entry AS (
    file_name character varying,
    s3_path character varying,
    file_hash character varying,
    file_size bigint
);

ALTER TABLE app_versions 
  ALTER COLUMN manifest TYPE manifest_entry[] USING NULL;
