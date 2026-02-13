CREATE OR REPLACE FUNCTION public.get_admin_org_credit_stats(
  p_org_id uuid,
  p_since timestamptz DEFAULT now() - interval '30 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_empty CONSTANT text := '';
  c_service_role CONSTANT text := 'service_role';
  c_manual_source CONSTANT text := 'manual';
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_result jsonb;
BEGIN
  IF current_user <> 'postgres' AND COALESCE(v_request_role, c_empty) <> c_service_role THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required';
  END IF;

  WITH grant_totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN g.source <> c_manual_source THEN g.credits_total ELSE 0 END), 0) AS purchased_total,
      COALESCE(SUM(CASE WHEN g.source = c_manual_source THEN g.credits_total ELSE 0 END), 0) AS granted_total,
      COALESCE(SUM(CASE WHEN g.source <> c_manual_source AND g.granted_at >= p_since THEN g.credits_total ELSE 0 END), 0) AS purchased_30d,
      COALESCE(SUM(CASE WHEN g.source = c_manual_source AND g.granted_at >= p_since THEN g.credits_total ELSE 0 END), 0) AS granted_30d
    FROM public.usage_credit_grants AS g
    WHERE g.org_id = p_org_id
  ),
  transaction_totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN t.transaction_type = 'expiry'::public.credit_transaction_type THEN ABS(LEAST(t.amount, 0)) ELSE 0 END), 0) AS expired_total,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'deduction'::public.credit_transaction_type THEN ABS(LEAST(t.amount, 0)) ELSE 0 END), 0) AS deducted_total,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'refund'::public.credit_transaction_type THEN GREATEST(t.amount, 0) ELSE 0 END), 0) AS refunded_total,
      COALESCE(SUM(t.amount), 0) AS net_total,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'expiry'::public.credit_transaction_type AND t.occurred_at >= p_since THEN ABS(LEAST(t.amount, 0)) ELSE 0 END), 0) AS expired_30d,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'deduction'::public.credit_transaction_type AND t.occurred_at >= p_since THEN ABS(LEAST(t.amount, 0)) ELSE 0 END), 0) AS deducted_30d,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'refund'::public.credit_transaction_type AND t.occurred_at >= p_since THEN GREATEST(t.amount, 0) ELSE 0 END), 0) AS refunded_30d,
      COALESCE(SUM(CASE WHEN t.occurred_at >= p_since THEN t.amount ELSE 0 END), 0) AS net_30d
    FROM public.usage_credit_transactions AS t
    WHERE t.org_id = p_org_id
  ),
  consumption_totals AS (
    SELECT
      COALESCE(SUM(c.credits_used), 0) AS used_total,
      COALESCE(SUM(CASE WHEN c.applied_at >= p_since THEN c.credits_used ELSE 0 END), 0) AS used_30d
    FROM public.usage_credit_consumptions AS c
    WHERE c.org_id = p_org_id
  ),
  metric_totals AS (
    SELECT
      c.metric,
      COALESCE(SUM(c.credits_used), 0) AS used_total,
      COALESCE(SUM(CASE WHEN c.applied_at >= p_since THEN c.credits_used ELSE 0 END), 0) AS used_30d,
      COUNT(*) AS events
    FROM public.usage_credit_consumptions AS c
    WHERE c.org_id = p_org_id
    GROUP BY c.metric
  ),
  metric_json AS (
    SELECT
      (
        jsonb_build_object(
          'mau', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
          'bandwidth', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
          'storage', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
          'build_time', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0)
        )
        || COALESCE(
          (
            SELECT jsonb_object_agg(
              mt.metric::text,
              jsonb_build_object(
                'used_total', ROUND(mt.used_total::numeric, 2),
                'last_30_days', ROUND(mt.used_30d::numeric, 2),
                'events', mt.events
              )
            )
            FROM metric_totals AS mt
          ),
          '{}'::jsonb
        )
      ) AS usage_by_metric
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'purchased', ROUND(gt.purchased_total::numeric, 2),
      'granted', ROUND(gt.granted_total::numeric, 2),
      'used', ROUND(ct.used_total::numeric, 2),
      'expired', ROUND(tt.expired_total::numeric, 2),
      'deducted', ROUND(tt.deducted_total::numeric, 2),
      'refunded', ROUND(tt.refunded_total::numeric, 2),
      'net', ROUND(tt.net_total::numeric, 2)
    ),
    'last_30_days', jsonb_build_object(
      'purchased', ROUND(gt.purchased_30d::numeric, 2),
      'granted', ROUND(gt.granted_30d::numeric, 2),
      'used', ROUND(ct.used_30d::numeric, 2),
      'expired', ROUND(tt.expired_30d::numeric, 2),
      'deducted', ROUND(tt.deducted_30d::numeric, 2),
      'refunded', ROUND(tt.refunded_30d::numeric, 2),
      'net', ROUND(tt.net_30d::numeric, 2)
    ),
    'usage_by_metric', mj.usage_by_metric
  )
  INTO v_result
  FROM grant_totals AS gt
  CROSS JOIN transaction_totals AS tt
  CROSS JOIN consumption_totals AS ct
  CROSS JOIN metric_json AS mj;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'totals', jsonb_build_object('purchased', 0, 'granted', 0, 'used', 0, 'expired', 0, 'deducted', 0, 'refunded', 0, 'net', 0),
      'last_30_days', jsonb_build_object('purchased', 0, 'granted', 0, 'used', 0, 'expired', 0, 'deducted', 0, 'refunded', 0, 'net', 0),
      'usage_by_metric', jsonb_build_object(
        'mau', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
        'bandwidth', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
        'storage', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0),
        'build_time', jsonb_build_object('used_total', 0, 'last_30_days', 0, 'events', 0)
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_org_credit_stats(uuid, timestamptz)
IS 'Returns aggregated admin credit statistics for a single organization.';

REVOKE ALL ON FUNCTION public.get_admin_org_credit_stats(uuid, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.get_admin_org_credit_stats(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_admin_org_credit_stats(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_org_credit_stats(uuid, timestamptz) TO service_role;
