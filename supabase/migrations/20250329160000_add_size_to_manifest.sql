CREATE TYPE manifest_entry_new AS (
    file_name character varying,
    s3_path character varying,
    file_hash character varying,
    file_size bigint
);

ALTER TABLE app_versions 
  ALTER COLUMN manifest TYPE manifest_entry_new[] 
  USING array(
    SELECT ROW(m.file_name, m.s3_path, m.file_hash, 0)::manifest_entry_new 
    FROM unnest(manifest) m
  );

DROP TYPE IF EXISTS manifest_entry CASCADE;
ALTER TYPE manifest_entry_new RENAME TO manifest_entry;
