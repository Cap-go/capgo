-- Add cli_version column to app_versions table to track which CLI version was used to upload the bundle
ALTER TABLE public.app_versions
ADD COLUMN IF NOT EXISTS cli_version character varying;

-- Add comment to explain the column
COMMENT ON COLUMN public.app_versions.cli_version IS 'The version of @capgo/cli used to upload this bundle';
