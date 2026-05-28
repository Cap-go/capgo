CREATE INDEX IF NOT EXISTS manifest_file_name_idx ON public.manifest USING btree (file_name);

CREATE INDEX IF NOT EXISTS manifest_file_hash_idx ON public.manifest USING btree (file_hash);
