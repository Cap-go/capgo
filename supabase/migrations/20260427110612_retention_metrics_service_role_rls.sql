-- Keep retention metrics internal to backend workers while satisfying the
-- project-wide RLS convention for public tables.
ALTER TABLE public.daily_revenue_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access" ON public.daily_revenue_metrics;

CREATE POLICY "Allow service_role full access" ON public.daily_revenue_metrics FOR ALL TO service_role USING (
    true
)
WITH
CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access" ON public.processed_stripe_events;

CREATE POLICY "Allow service_role full access" ON public.processed_stripe_events FOR ALL TO service_role USING (
    true
)
WITH
CHECK (true);
