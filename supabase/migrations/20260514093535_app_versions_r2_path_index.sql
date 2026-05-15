CREATE INDEX CONCURRENTLY IF NOT EXISTS app_versions_r2_path_idx ON public.app_versions USING btree (r2_path);
