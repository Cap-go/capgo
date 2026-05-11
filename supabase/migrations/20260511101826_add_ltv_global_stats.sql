ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS average_ltv double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS shortest_ltv double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS longest_ltv double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.average_ltv IS
'Average estimated customer LTV in dollars for the daily snapshot.';
COMMENT ON COLUMN public.global_stats.shortest_ltv IS
'Lowest estimated customer LTV in dollars for the daily snapshot.';
COMMENT ON COLUMN public.global_stats.longest_ltv IS
'Highest estimated customer LTV in dollars for the daily snapshot.';
