CREATE INDEX IF NOT EXISTS ON public.manifest USING btree (file_name);

CREATE INDEX IF NOT EXISTS ON public.manifest USING btree (file_hash);
