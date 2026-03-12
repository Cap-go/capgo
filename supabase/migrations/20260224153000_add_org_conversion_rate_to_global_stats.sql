ALTER TABLE public.global_stats
ADD COLUMN org_conversion_rate double precision NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.global_stats.org_conversion_rate IS 'Percentage of organizations that are paying (paying / orgs * 100)';
