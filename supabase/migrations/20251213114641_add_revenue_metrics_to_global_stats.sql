-- Add revenue metrics columns to global_stats table
-- These will store MRR (Monthly Recurring Revenue) and ARR (Annual Recurring Revenue) per plan

-- Revenue metrics (in dollars)
ALTER TABLE public.global_stats
ADD COLUMN mrrr double precision DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN total_revenue double precision DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN revenue_solo double precision DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN revenue_maker double precision DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN revenue_team double precision DEFAULT 0 NOT NULL;

-- Per-plan monthly/yearly subscription counts
ALTER TABLE public.global_stats
ADD COLUMN plan_solo_monthly integer DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN plan_solo_yearly integer DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN plan_maker_monthly integer DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN plan_maker_yearly integer DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN plan_team_monthly integer DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN plan_team_yearly integer DEFAULT 0 NOT NULL;

-- Credits tracking
ALTER TABLE public.global_stats
ADD COLUMN credits_bought bigint DEFAULT 0 NOT NULL;

ALTER TABLE public.global_stats
ADD COLUMN credits_consumed bigint DEFAULT 0 NOT NULL;

-- Comments
COMMENT ON COLUMN public.global_stats.mrrr IS 'Total Monthly Recurring Revenue in dollars';
COMMENT ON COLUMN public.global_stats.total_revenue IS 'Total Annual Recurring Revenue (ARR) in dollars';
COMMENT ON COLUMN public.global_stats.revenue_solo IS 'Solo plan ARR in dollars';
COMMENT ON COLUMN public.global_stats.revenue_maker IS 'Maker plan ARR in dollars';
COMMENT ON COLUMN public.global_stats.revenue_team IS 'Team plan ARR in dollars';
COMMENT ON COLUMN public.global_stats.plan_solo_monthly IS 'Number of Solo plan monthly subscriptions';
COMMENT ON COLUMN public.global_stats.plan_solo_yearly IS 'Number of Solo plan yearly subscriptions';
COMMENT ON COLUMN public.global_stats.plan_maker_monthly IS 'Number of Maker plan monthly subscriptions';
COMMENT ON COLUMN public.global_stats.plan_maker_yearly IS 'Number of Maker plan yearly subscriptions';
COMMENT ON COLUMN public.global_stats.plan_team_monthly IS 'Number of Team plan monthly subscriptions';
COMMENT ON COLUMN public.global_stats.plan_team_yearly IS 'Number of Team plan yearly subscriptions';
COMMENT ON COLUMN public.global_stats.credits_bought IS 'Total credits purchased today';
COMMENT ON COLUMN public.global_stats.credits_consumed IS 'Total credits consumed today';
