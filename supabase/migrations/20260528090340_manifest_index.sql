CREATE INDEX IF NOT EXISTS idx_manifest_file_name ON public.manifest USING btree (file_name);

CREATE INDEX IF NOT EXISTS idx_manifest_file_hash ON public.manifest USING btree (file_hash);
