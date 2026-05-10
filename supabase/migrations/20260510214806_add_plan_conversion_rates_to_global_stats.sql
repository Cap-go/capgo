ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS plan_solo_conversion_rate double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS plan_maker_conversion_rate double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS plan_team_conversion_rate double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS plan_enterprise_conversion_rate double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.plan_solo_conversion_rate IS 'Percentage of organizations converted to the Solo plan (plan_solo / orgs * 100)';
COMMENT ON COLUMN public.global_stats.plan_maker_conversion_rate IS 'Percentage of organizations converted to the Maker plan (plan_maker / orgs * 100)';
COMMENT ON COLUMN public.global_stats.plan_team_conversion_rate IS 'Percentage of organizations converted to the Team plan (plan_team / orgs * 100)';
COMMENT ON COLUMN public.global_stats.plan_enterprise_conversion_rate IS 'Percentage of organizations converted to the Enterprise plan (plan_enterprise / orgs * 100)';
