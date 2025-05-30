-- fix perf issue

-- Create index to speed up date comparison and app_id lookups
CREATE INDEX IF NOT EXISTS idx_app_versions_created_at_app_id ON public.app_versions USING btree (created_at, app_id);

-- Create index to speed up checks on channels table
CREATE INDEX IF NOT EXISTS idx_channels_app_id_version ON public.channels USING btree (app_id, version);

