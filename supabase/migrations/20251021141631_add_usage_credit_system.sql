-- Add entities to support usage-based credits and overage handling

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'credit_metric_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.credit_metric_type AS ENUM ('mau', 'bandwidth', 'storage');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'credit_transaction_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.credit_transaction_type AS ENUM ('grant', 'purchase', 'manual_grant', 'deduction', 'expiry', 'refund');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.usage_credit_grants (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  credits_total numeric(18, 6) NOT NULL CHECK (credits_total >= 0),
  credits_consumed numeric(18, 6) DEFAULT 0 NOT NULL CHECK (credits_consumed >= 0),
  granted_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '1 year') NOT NULL,
  source text DEFAULT 'manual'::text NOT NULL,
  source_ref jsonb,
  notes text,
  CHECK (credits_consumed <= credits_total)
);

COMMENT ON TABLE public.usage_credit_grants IS 'Records every block of credits granted to an org, tracking totals, consumption and expiry.';

CREATE INDEX IF NOT EXISTS idx_usage_credit_grants_org_expires ON public.usage_credit_grants (org_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_usage_credit_grants_org_remaining ON public.usage_credit_grants (org_id, (credits_total - credits_consumed));

CREATE TABLE IF NOT EXISTS public.usage_credit_transactions (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  grant_id uuid REFERENCES public.usage_credit_grants (id) ON DELETE SET NULL,
  transaction_type public.credit_transaction_type NOT NULL,
  amount numeric(18, 6) NOT NULL,
  balance_after numeric(18, 6),
  occurred_at timestamptz DEFAULT now() NOT NULL,
  description text,
  source_ref jsonb
);

COMMENT ON TABLE public.usage_credit_transactions IS 'General ledger of credit movements (grants, purchases, deductions, expiries, refunds) with running balances.';

CREATE INDEX IF NOT EXISTS idx_usage_credit_transactions_org_time ON public.usage_credit_transactions (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_credit_transactions_grant ON public.usage_credit_transactions (grant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.usage_overage_events (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  metric public.credit_metric_type NOT NULL,
  overage_amount numeric(20, 6) NOT NULL CHECK (overage_amount >= 0),
  credits_estimated numeric(18, 6) NOT NULL CHECK (credits_estimated >= 0),
  credits_debited numeric(18, 6) DEFAULT 0 NOT NULL CHECK (credits_debited >= 0),
  credit_step_id bigint REFERENCES public.capgo_credits_steps (id) ON DELETE SET NULL,
  billing_cycle_start date,
  billing_cycle_end date,
  created_at timestamptz DEFAULT now() NOT NULL,
  details jsonb
);

COMMENT ON TABLE public.usage_overage_events IS 'Snapshots of detected plan overages, capturing usage, credits applied, and linkage back to pricing tiers.';

CREATE INDEX IF NOT EXISTS idx_usage_overage_events_org_time ON public.usage_overage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_overage_events_metric ON public.usage_overage_events (metric);

CREATE TABLE IF NOT EXISTS public.usage_credit_consumptions (
  id bigserial PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES public.usage_credit_grants (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  overage_event_id uuid REFERENCES public.usage_overage_events (id) ON DELETE SET NULL,
  metric public.credit_metric_type NOT NULL,
  credits_used numeric(18, 6) NOT NULL CHECK (credits_used > 0),
  applied_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.usage_credit_consumptions IS 'Detailed allocation records showing which grants covered each overage event and how many credits were used.';

CREATE INDEX IF NOT EXISTS idx_usage_credit_consumptions_org_time ON public.usage_credit_consumptions (org_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_credit_consumptions_grant ON public.usage_credit_consumptions (grant_id, applied_at DESC);

CREATE OR REPLACE FUNCTION public.calculate_credit_cost(
  p_metric public.credit_metric_type,
  p_overage_amount numeric
) RETURNS TABLE (
  credit_step_id bigint,
  credit_cost_per_unit numeric,
  credits_required numeric
) LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  v_step public.capgo_credits_steps%ROWTYPE;
  v_highest public.capgo_credits_steps%ROWTYPE;
  v_remaining numeric;
  v_applied_range numeric;
  v_units numeric;
  v_total_credits numeric := 0;
  v_last_step_id bigint := NULL;
  v_unit_factor numeric;
BEGIN
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  v_remaining := p_overage_amount;

  SELECT *
  INTO v_highest
  FROM public.capgo_credits_steps
  WHERE type = p_metric::text
  ORDER BY step_max DESC, step_min DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING 'No pricing steps found for metric: %', p_metric::text;
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  FOR v_step IN
    SELECT *
    FROM public.capgo_credits_steps
    WHERE type = p_metric::text
    ORDER BY step_min ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF p_overage_amount < v_step.step_min THEN
      EXIT;
    END IF;

    v_applied_range := LEAST(
      v_remaining,
      (v_step.step_max - v_step.step_min)::numeric
    );

    IF v_applied_range <= 0 THEN
      CONTINUE;
    END IF;

    v_unit_factor := GREATEST(NULLIF(v_step.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_applied_range / v_unit_factor);

    IF v_units <= 0 THEN
      CONTINUE;
    END IF;

    v_total_credits := v_total_credits + (v_units * v_step.price_per_unit::numeric);
    v_remaining := v_remaining - v_applied_range;
    v_last_step_id := v_step.id;
  END LOOP;

  IF v_remaining > 0 THEN
    v_unit_factor := GREATEST(NULLIF(v_highest.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_remaining / v_unit_factor);

    IF v_units > 0 THEN
      v_total_credits := v_total_credits + (v_units * v_highest.price_per_unit::numeric);
      v_last_step_id := v_highest.id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_last_step_id::bigint,
    CASE WHEN p_overage_amount > 0 THEN v_total_credits / p_overage_amount ELSE 0 END,
    v_total_credits;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_usage_overage(
  p_org_id uuid,
  p_metric public.credit_metric_type,
  p_overage_amount numeric,
  p_billing_cycle_start timestamptz,
  p_billing_cycle_end timestamptz,
  p_details jsonb DEFAULT NULL
) RETURNS TABLE (
  overage_amount numeric,
  credits_required numeric,
  credits_applied numeric,
  credits_remaining numeric,
  credit_step_id bigint,
  overage_covered numeric,
  overage_unpaid numeric,
  overage_event_id uuid
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_calc RECORD;
  v_event_id uuid;
  v_remaining numeric := 0;
  v_applied numeric := 0;
  v_per_unit numeric := 0;
  v_available numeric;
  v_use numeric;
  v_balance numeric;
  v_overage_paid numeric := 0;
  grant_rec public.usage_credit_grants%ROWTYPE;
BEGIN
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  SELECT *
  INTO v_calc
  FROM public.calculate_credit_cost(p_metric, p_overage_amount)
  LIMIT 1;

  IF v_calc.credit_step_id IS NULL THEN
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      credit_step_id,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES (
      p_org_id,
      p_metric,
      p_overage_amount,
      0,
      0,
      NULL,
      p_billing_cycle_start,
      p_billing_cycle_end,
      p_details
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT p_overage_amount, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, p_overage_amount, v_event_id;
    RETURN;
  END IF;

  v_per_unit := v_calc.credit_cost_per_unit;
  v_remaining := v_calc.credits_required;

  INSERT INTO public.usage_overage_events (
    org_id,
    metric,
    overage_amount,
    credits_estimated,
    credits_debited,
    credit_step_id,
    billing_cycle_start,
    billing_cycle_end,
    details
  )
  VALUES (
    p_org_id,
    p_metric,
    p_overage_amount,
    v_calc.credits_required,
    0,
    v_calc.credit_step_id,
    p_billing_cycle_start,
    p_billing_cycle_end,
    p_details
  )
  RETURNING id INTO v_event_id;

  FOR grant_rec IN
    SELECT *
    FROM public.usage_credit_grants
    WHERE org_id = p_org_id
      AND expires_at >= now()
      AND credits_consumed < credits_total
    ORDER BY expires_at ASC, granted_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_available := grant_rec.credits_total - grant_rec.credits_consumed;
    IF v_available <= 0 THEN
      CONTINUE;
    END IF;

    v_use := LEAST(v_available, v_remaining);
    v_remaining := v_remaining - v_use;
    v_applied := v_applied + v_use;

    UPDATE public.usage_credit_grants
    SET credits_consumed = credits_consumed + v_use
    WHERE id = grant_rec.id;

    INSERT INTO public.usage_credit_consumptions (
      grant_id,
      org_id,
      overage_event_id,
      metric,
      credits_used
    )
    VALUES (
      grant_rec.id,
      p_org_id,
      v_event_id,
      p_metric,
      v_use
    );

    SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
    INTO v_balance
    FROM public.usage_credit_grants
    WHERE org_id = p_org_id
      AND expires_at >= now();

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES (
      p_org_id,
      grant_rec.id,
      'deduction',
      -v_use,
      v_balance,
      now(),
      format('Overage deduction for %s usage', p_metric::text),
      jsonb_build_object('overage_event_id', v_event_id, 'metric', p_metric::text)
    );
  END LOOP;

  UPDATE public.usage_overage_events
  SET credits_debited = v_applied
  WHERE id = v_event_id;

  IF v_per_unit > 0 THEN
    v_overage_paid := LEAST(p_overage_amount, v_applied / v_per_unit);
  ELSE
    v_overage_paid := p_overage_amount;
  END IF;

  RETURN QUERY SELECT
    p_overage_amount,
    v_calc.credits_required,
    v_applied,
    v_remaining,
    v_calc.credit_step_id,
    v_overage_paid,
    GREATEST(p_overage_amount - v_overage_paid, 0),
    v_event_id;
END;
$$;


CREATE VIEW public.usage_credit_balances AS
SELECT
  org_id,
  SUM(GREATEST(credits_total, 0)) AS total_credits,
  SUM(GREATEST(CASE WHEN expires_at >= now() THEN credits_total - credits_consumed ELSE 0 END, 0)) AS available_credits,
  MIN(CASE WHEN credits_total - credits_consumed > 0 THEN expires_at END) AS next_expiration
FROM public.usage_credit_grants
GROUP BY org_id;

COMMENT ON VIEW public.usage_credit_balances IS 'Aggregated balance view per org: total credits granted, remaining unexpired credits, and the closest upcoming expiry.';

GRANT SELECT ON public.usage_credit_balances TO anon;
GRANT SELECT ON public.usage_credit_balances TO authenticated;
GRANT SELECT ON public.usage_credit_balances TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_credit_cost(public.credit_metric_type, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_usage_overage(uuid, public.credit_metric_type, numeric, timestamptz, timestamptz, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.get_orgs_v6();
DROP FUNCTION IF EXISTS public.get_orgs_v6(userid uuid);

CREATE OR REPLACE FUNCTION public.get_orgs_v6 ()
RETURNS TABLE (
  gid uuid,
  created_by uuid,
  logo text,
  name text,
  role character varying,
  paying boolean,
  trial_left integer,
  can_use_more boolean,
  is_canceled boolean,
  app_count bigint,
  subscription_start timestamptz,
  subscription_end timestamptz,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  next_stats_update_at timestamptz,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamptz
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  user_id := NULL;

  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key = api_key_text INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v6(user_id) AS orgs
      WHERE orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  IF user_id IS NULL THEN
    SELECT public.get_identity() INTO user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.get_orgs_v6(user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orgs_v6 (userid uuid)
RETURNS TABLE (
  gid uuid,
  created_by uuid,
  logo text,
  name text,
  role character varying,
  paying boolean,
  trial_left integer,
  can_use_more boolean,
  is_canceled boolean,
  app_count bigint,
  subscription_start timestamptz,
  subscription_end timestamptz,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  next_stats_update_at timestamptz,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamptz
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id AS gid,
    sub.created_by,
    sub.logo,
    sub.name,
    org_users.user_right::varchar AS role,
    public.is_paying_org(sub.id) AS paying,
    public.is_trial_org(sub.id) AS trial_left,
    public.is_allowed_action_org(sub.id) AS can_use_more,
    public.is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM public.apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email,
    public.is_org_yearly(sub.id) AS is_yearly,
    sub.stats_updated_at,
    public.get_next_stats_update_date(sub.id) AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration
  FROM (
    SELECT public.get_cycle_info_org(o.id) AS f, o.*
    FROM public.orgs AS o
  ) AS sub
  JOIN public.org_users
    ON org_users.user_id = userid
   AND sub.id = org_users.org_id
  LEFT JOIN public.usage_credit_balances ucb
    ON ucb.org_id = sub.id;
END;
$$;

GRANT ALL ON FUNCTION public.get_orgs_v6() TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v6() TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v6() TO service_role;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_usage_credits()
RETURNS bigint LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  grant_rec public.usage_credit_grants%ROWTYPE;
  credits_to_expire numeric;
  balance_after numeric;
  expired_count bigint := 0;
BEGIN
  FOR grant_rec IN
    SELECT *
    FROM public.usage_credit_grants
    WHERE expires_at < now()
      AND credits_total > credits_consumed
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    credits_to_expire := grant_rec.credits_total - grant_rec.credits_consumed;

    UPDATE public.usage_credit_grants
    SET credits_consumed = credits_total
    WHERE id = grant_rec.id;

    SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
    INTO balance_after
    FROM public.usage_credit_grants
    WHERE org_id = grant_rec.org_id
      AND expires_at >= now();

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES (
      grant_rec.org_id,
      grant_rec.id,
      'expiry',
      -credits_to_expire,
      balance_after,
      now(),
      'Expired usage credits',
      jsonb_build_object('reason', 'expiry', 'expires_at', grant_rec.expires_at)
    );

    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_usage_credits() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('usage_credit_expiry');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;
SELECT cron.schedule(
  'usage_credit_expiry',
  '0 3 * * *',
  'SELECT public.expire_usage_credits()'
);
