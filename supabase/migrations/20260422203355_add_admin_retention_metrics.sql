CREATE TABLE IF NOT EXISTS public.daily_revenue_metrics (
  date_id character varying NOT NULL,
  customer_id character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  opening_mrr double precision DEFAULT 0 NOT NULL,
  new_business_mrr double precision DEFAULT 0 NOT NULL,
  expansion_mrr double precision DEFAULT 0 NOT NULL,
  contraction_mrr double precision DEFAULT 0 NOT NULL,
  churn_mrr double precision DEFAULT 0 NOT NULL,
  CONSTRAINT daily_revenue_metrics_pkey PRIMARY KEY (date_id, customer_id)
);

ALTER TABLE public.daily_revenue_metrics OWNER TO postgres;

COMMENT ON TABLE public.daily_revenue_metrics IS 'Daily MRR movement rollup per customer, fed by Stripe webhook events for admin retention analytics.';
COMMENT ON COLUMN public.daily_revenue_metrics.opening_mrr IS 'Customer monthly recurring revenue at the start of the UTC day, before any tracked movement.';
COMMENT ON COLUMN public.daily_revenue_metrics.new_business_mrr IS 'New monthly recurring revenue created on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.expansion_mrr IS 'Expansion monthly recurring revenue added on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.contraction_mrr IS 'Monthly recurring revenue lost to downgrades on the day.';
COMMENT ON COLUMN public.daily_revenue_metrics.churn_mrr IS 'Monthly recurring revenue fully lost to churn on the day.';

CREATE INDEX IF NOT EXISTS daily_revenue_metrics_date_id_idx
ON public.daily_revenue_metrics (date_id);

REVOKE ALL ON TABLE public.daily_revenue_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.daily_revenue_metrics FROM anon;
REVOKE ALL ON TABLE public.daily_revenue_metrics FROM authenticated;
GRANT ALL ON TABLE public.daily_revenue_metrics TO service_role;

ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS nrr double precision DEFAULT 100 NOT NULL,
ADD COLUMN IF NOT EXISTS churn_revenue double precision DEFAULT 0 NOT NULL;

UPDATE public.global_stats
SET nrr = 100
WHERE nrr IS NULL;

UPDATE public.global_stats
SET churn_revenue = 0
WHERE churn_revenue IS NULL;

COMMENT ON COLUMN public.global_stats.nrr IS 'Net Revenue Retention percentage for the day based on prior-day MRR, excluding new business.';
COMMENT ON COLUMN public.global_stats.churn_revenue IS 'Total monthly recurring revenue lost to churn and downgrades on the day in dollars.';
