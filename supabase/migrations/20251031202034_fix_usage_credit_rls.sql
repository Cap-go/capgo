-- Fix RLS and security issues for usage credit system tables
-- Enable RLS on all usage credit tables
ALTER TABLE public.usage_credit_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_credit_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_overage_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_credit_consumptions ENABLE ROW LEVEL SECURITY;

-- Drop existing view to recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.usage_credit_balances;

-- Create RLS policies for usage_credit_grants
-- Service role has full access (needed for backend operations)
CREATE POLICY "Allow service_role full access" ON public.usage_credit_grants FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Org admins can read their org's grants
CREATE POLICY "Allow read for org admin" ON public.usage_credit_grants FOR
SELECT
  TO authenticated USING (
    public.check_min_rights (
      'admin'::public.user_min_right,
      public.get_identity (),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Create RLS policies for usage_credit_transactions
-- Service role has full access (needed for backend operations)
CREATE POLICY "Allow service_role full access" ON public.usage_credit_transactions FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Org admins can read their org's transactions
CREATE POLICY "Allow read for org admin" ON public.usage_credit_transactions FOR
SELECT
  TO authenticated USING (
    public.check_min_rights (
      'admin'::public.user_min_right,
      public.get_identity (),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Create RLS policies for usage_overage_events
-- Service role has full access (needed for backend operations)
CREATE POLICY "Allow service_role full access" ON public.usage_overage_events FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Org admins can read their org's overage events
CREATE POLICY "Allow read for org admin" ON public.usage_overage_events FOR
SELECT
  TO authenticated USING (
    public.check_min_rights (
      'admin'::public.user_min_right,
      public.get_identity (),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Create RLS policies for usage_credit_consumptions
-- Service role has full access (needed for backend operations)
CREATE POLICY "Allow service_role full access" ON public.usage_credit_consumptions FOR ALL TO service_role USING (true)
WITH
  CHECK (true);

-- Org admins can read their org's consumptions
CREATE POLICY "Allow read for org admin" ON public.usage_credit_consumptions FOR
SELECT
  TO authenticated USING (
    public.check_min_rights (
      'admin'::public.user_min_right,
      public.get_identity (),
      org_id,
      NULL::character varying,
      NULL::bigint
    )
  );

-- Recreate view without SECURITY DEFINER
-- The view will respect RLS policies on the underlying table
CREATE VIEW public.usage_credit_balances AS
SELECT
  org_id,
  SUM(GREATEST(credits_total, 0)) AS total_credits,
  SUM(
    GREATEST(
      CASE
        WHEN expires_at >= now() THEN credits_total - credits_consumed
        ELSE 0
      END,
      0
    )
  ) AS available_credits,
  MIN(
    CASE
      WHEN credits_total - credits_consumed > 0 THEN expires_at
    END
  ) AS next_expiration
FROM
  public.usage_credit_grants
GROUP BY
  org_id;

COMMENT ON VIEW public.usage_credit_balances IS 'Aggregated balance view per org: total credits granted, remaining unexpired credits, and the closest upcoming expiry. Respects RLS policies.';

-- Grant permissions on the view
GRANT
SELECT
  ON public.usage_credit_balances TO authenticated;

GRANT
SELECT
  ON public.usage_credit_balances TO service_role;
