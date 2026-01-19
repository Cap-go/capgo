-- Add plugin version breakdown columns to global_stats table
-- This stores JSON breakdowns of plugin versions installed on devices

-- Full plugin version breakdown (e.g., {"6.2.5": 45.2, "6.1.0": 30.1, ...})
ALTER TABLE public.global_stats
ADD COLUMN plugin_version_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Major version breakdown (e.g., {"6": 75.3, "5": 20.5, ...})
ALTER TABLE public.global_stats
ADD COLUMN plugin_major_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.global_stats.plugin_version_breakdown IS 'JSON breakdown of plugin version percentages. Format: {"version": percentage, ...}';
COMMENT ON COLUMN public.global_stats.plugin_major_breakdown IS 'JSON breakdown of plugin major version percentages. Format: {"major_version": percentage, ...}';
