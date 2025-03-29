DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'app_versions' 
        AND column_name = 'manifest'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_type 
            WHERE typname = 'manifest_entry'
        ) THEN
            CREATE TYPE manifest_entry AS (
                file_name character varying,
                s3_path character varying,
                file_hash character varying
            );
        END IF;
        
        ALTER TABLE app_versions ADD COLUMN manifest manifest_entry[];
    END IF;
END $$;

DROP TYPE IF EXISTS manifest_entry CASCADE;

CREATE TYPE manifest_entry AS (
    file_name character varying,
    s3_path character varying,
    file_hash character varying,
    file_size bigint
);

ALTER TABLE app_versions 
  ALTER COLUMN manifest TYPE manifest_entry[] USING NULL;
