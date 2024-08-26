ALTER TABLE apps
ADD COLUMN default_upload_channel character varying DEFAULT 'dev' NOT NULL;