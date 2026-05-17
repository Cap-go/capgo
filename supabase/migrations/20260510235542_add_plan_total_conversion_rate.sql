ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS plan_total_conversion_rate double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.plan_total_conversion_rate IS 'Percentage of organizations converted to any paid plan ((plan_solo + plan_maker + plan_team + plan_enterprise) / orgs * 100)';
