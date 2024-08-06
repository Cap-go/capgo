CREATE TYPE manifest_entry AS (
    file_name character varying,
    s3_path character varying,
    file_hash character varying
); 

ALTER TABLE app_versions ADD COLUMN 
manifest manifest_entry[];