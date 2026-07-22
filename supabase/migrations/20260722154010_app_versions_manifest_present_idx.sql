-- Permanent partial index for hourly dual-storage reclaim candidate discovery.
-- Non-concurrent: migration transactions cannot use CREATE INDEX CONCURRENTLY.
CREATE INDEX IF NOT EXISTS app_versions_manifest_present_idx
  ON public.app_versions USING btree (id)
  WHERE manifest IS NOT NULL;
