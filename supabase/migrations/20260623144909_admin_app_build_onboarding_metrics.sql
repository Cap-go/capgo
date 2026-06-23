ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS apps_created bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apps_with_cli_onboarding_builds_24h bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apps_with_manual_builds_24h bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.global_stats.apps_created IS 'Number of apps created during the UTC day.';
COMMENT ON COLUMN public.global_stats.apps_with_cli_onboarding_builds_24h IS 'Number of apps created during the UTC day with more than two cli-onboarding native build requests in the first 24 hours after app creation.';
COMMENT ON COLUMN public.global_stats.apps_with_manual_builds_24h IS 'Number of apps created during the UTC day with more than two manual native build requests in the first 24 hours after app creation.';

CREATE INDEX IF NOT EXISTS idx_apps_created_at
ON public.apps (created_at);

CREATE INDEX IF NOT EXISTS idx_build_requests_app_created_at
ON public.build_requests (app_id, created_at);
