-- Keep retention metrics internal to backend workers while satisfying the
-- project-wide RLS convention for public tables. service_role bypasses RLS, so
-- backend-only tables use deny-all policies instead of service_role policies.
ALTER TABLE public.daily_revenue_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access" ON public.daily_revenue_metrics;
DROP POLICY IF EXISTS "Deny all access" ON public.daily_revenue_metrics;

CREATE POLICY "Deny all access" ON public.daily_revenue_metrics FOR ALL USING (
    false
)
WITH
CHECK (false);

DROP POLICY IF EXISTS "Allow service_role full access" ON public.processed_stripe_events;
DROP POLICY IF EXISTS "Deny all access" ON public.processed_stripe_events;

CREATE POLICY "Deny all access" ON public.processed_stripe_events FOR ALL USING (
    false
)
WITH
CHECK (false);
