ALTER TABLE public.daily_revenue_metrics
ADD COLUMN IF NOT EXISTS churn_mrr_solo
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_mrr_maker
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_mrr_team
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_mrr_enterprise
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS contraction_mrr_solo
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS contraction_mrr_maker
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS contraction_mrr_team
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS contraction_mrr_enterprise
double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.daily_revenue_metrics.churn_mrr_solo IS
'Solo plan MRR fully lost to churn on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.churn_mrr_maker IS
'Maker plan MRR fully lost to churn on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.churn_mrr_team IS
'Team plan MRR fully lost to churn on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.churn_mrr_enterprise IS
'Enterprise plan MRR fully lost to churn on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.contraction_mrr_solo IS
'Solo plan MRR lost to downgrades on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.contraction_mrr_maker IS
'Maker plan MRR lost to downgrades on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.contraction_mrr_team IS
'Team plan MRR lost to downgrades on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.contraction_mrr_enterprise IS
'Enterprise plan MRR lost to downgrades on the day.';

ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS churn_revenue_solo
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_revenue_maker
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_revenue_team
double precision DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_revenue_enterprise
double precision DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.churn_revenue_solo IS
'Solo plan MRR lost to churn and downgrades on the day.';
COMMENT ON COLUMN public.global_stats.churn_revenue_maker IS
'Maker plan MRR lost to churn and downgrades on the day.';
COMMENT ON COLUMN public.global_stats.churn_revenue_team IS
'Team plan MRR lost to churn and downgrades on the day.';
COMMENT ON COLUMN public.global_stats.churn_revenue_enterprise IS
'Enterprise plan MRR lost to churn and downgrades on the day.';
