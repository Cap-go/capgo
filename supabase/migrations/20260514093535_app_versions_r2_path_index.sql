CREATE INDEX CONCURRENTLY IF NOT EXISTS app_versions_r2_path_idx ON public.app_versions USING btree (r2_path);

ALTER TABLE public.app_versions
SET
  (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );

ALTER TABLE public.daily_mau
SET
  (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );

ALTER TABLE public.daily_storage
SET
  (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );

ALTER TABLE public.daily_bandwidth
SET
  (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );

ALTER TABLE public.daily_version
SET
  (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
  );
