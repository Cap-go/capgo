ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS builder_active_paying_clients_60d integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS live_updates_active_paying_clients_60d integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.builder_active_paying_clients_60d IS 'Number of paying clients with Capgo Builder activity in the trailing 60 days for the UTC day.';
COMMENT ON COLUMN public.global_stats.live_updates_active_paying_clients_60d IS 'Number of paying clients with Live Updates activity in the trailing 60 days for the UTC day.';
