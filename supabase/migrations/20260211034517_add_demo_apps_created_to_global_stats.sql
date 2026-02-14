ALTER TABLE public.global_stats
ADD COLUMN demo_apps_created integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.global_stats.demo_apps_created IS 'Number of demo apps created in the last 24 hours';
