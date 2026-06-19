-- 1) Remove every global bandwidth row that is NOT your canonical TB tier
DELETE FROM public.capgo_credits_steps
WHERE type = 'bandwidth'
  AND org_id IS NULL
  AND (step_min, step_max) NOT IN (
    (0, 1099511627776),
    (1099511627776, 2199023255552),
    (2199023255552, 6597069766656),
    (6597069766656, 13194139533312),
    (13194139533312, 27487790694400),
    (27487790694400, 69269232549888),
    (69269232549888, 139637976727552),
    (139637976727552, 9223372036854775807)
  );

-- 2) Halve prices on the 8 rows you keep
UPDATE public.capgo_credits_steps
SET
  price_per_unit = CASE step_min
    WHEN 0 THEN 0.06
    WHEN 1099511627776 THEN 0.05
    WHEN 2199023255552 THEN 0.0425
    WHEN 6597069766656 THEN 0.035
    WHEN 13194139533312 THEN 0.0275
    WHEN 27487790694400 THEN 0.02
    WHEN 69269232549888 THEN 0.015
    WHEN 139637976727552 THEN 0.01
    ELSE price_per_unit
  END,
  updated_at = now()
WHERE type = 'bandwidth' AND org_id IS NULL;


WITH affected_orgs AS (
  SELECT
    o.id AS org_id,
    si.customer_id,
    p.name AS plan_name,
    (
      o.has_usage_credits IS TRUE
      AND NOT (
        si.trial_at > now()
        OR (
          si.status = 'succeeded'::public.stripe_status
          AND (
            si.subscription_anchor_end IS NULL
            OR si.subscription_anchor_end > now()
          )
        )
      )
    ) AS is_credit_only,
    CASE
      WHEN o.has_usage_credits IS TRUE
        AND NOT (
          si.trial_at > now()
          OR (
            si.status = 'succeeded'::public.stripe_status
            AND (
              si.subscription_anchor_end IS NULL
              OR si.subscription_anchor_end > now()
            )
          )
        )
        THEN 0::bigint
      ELSE p.bandwidth
    END AS plan_bandwidth
  FROM public.orgs AS o
  JOIN public.stripe_info AS si ON si.customer_id = o.customer_id
  JOIN public.plans AS p ON p.stripe_id = si.product_id
  WHERE si.bandwidth_exceeded IS TRUE
),
org_cycle AS (
  SELECT
    affected_orgs.org_id,
    affected_orgs.customer_id,
    affected_orgs.plan_name,
    affected_orgs.is_credit_only,
    affected_orgs.plan_bandwidth,
    cycle.subscription_anchor_start::date AS cycle_start,
    cycle.subscription_anchor_end::date AS cycle_end
  FROM affected_orgs
  CROSS JOIN LATERAL public.get_cycle_info_org(affected_orgs.org_id) AS cycle
),
org_usage AS (
  SELECT
    org_cycle.org_id,
    org_cycle.customer_id,
    org_cycle.plan_name,
    org_cycle.is_credit_only,
    org_cycle.plan_bandwidth,
    org_cycle.cycle_start,
    org_cycle.cycle_end,
    GREATEST(
      COALESCE(metrics.bandwidth, 0)::numeric - COALESCE(org_cycle.plan_bandwidth, 0)::numeric,
      0::numeric
    ) AS bandwidth_overage
  FROM org_cycle
  CROSS JOIN LATERAL public.get_total_metrics(
    org_cycle.org_id,
    org_cycle.cycle_start,
    org_cycle.cycle_end
  ) AS metrics
),
org_plan_status AS (
  SELECT
    org_usage.org_id,
    org_usage.customer_id,
    org_usage.plan_name,
    org_usage.is_credit_only,
    org_usage.plan_bandwidth,
    org_usage.cycle_start,
    org_usage.cycle_end,
    org_usage.bandwidth_overage,
    plan_fit.is_good_plan,
    plan_fit.mau_percent,
    plan_fit.bandwidth_percent,
    plan_fit.storage_percent,
    plan_fit.build_time_percent
  FROM org_usage
  CROSS JOIN LATERAL public.get_plan_usage_and_fit_uncached(org_usage.org_id) AS plan_fit
),
org_credit_cost AS (
  SELECT
    org_plan_status.org_id,
    org_plan_status.customer_id,
    org_plan_status.plan_name,
    org_plan_status.plan_bandwidth,
    org_plan_status.is_credit_only,
    org_plan_status.cycle_start,
    org_plan_status.cycle_end,
    org_plan_status.bandwidth_overage,
    org_plan_status.is_good_plan,
    org_plan_status.mau_percent,
    org_plan_status.bandwidth_percent,
    org_plan_status.storage_percent,
    org_plan_status.build_time_percent,
    credit_cost.credit_cost_per_unit
  FROM org_plan_status
  CROSS JOIN LATERAL public.calculate_credit_cost(
    'bandwidth'::public.credit_metric_type,
    org_plan_status.bandwidth_overage
  ) AS credit_cost
),
org_credit_debits AS (
  SELECT
    org_credit_cost.org_id,
    org_credit_cost.customer_id,
    org_credit_cost.plan_name,
    org_credit_cost.is_credit_only,
    org_credit_cost.plan_bandwidth,
    org_credit_cost.bandwidth_overage,
    org_credit_cost.is_good_plan,
    org_credit_cost.mau_percent,
    org_credit_cost.bandwidth_percent,
    org_credit_cost.storage_percent,
    org_credit_cost.build_time_percent,
    org_credit_cost.credit_cost_per_unit,
    COALESCE(SUM(uoe.credits_debited), 0::numeric) AS existing_credits_debited
  FROM org_credit_cost
  LEFT JOIN public.usage_overage_events AS uoe
    ON uoe.org_id = org_credit_cost.org_id
    AND uoe.metric = 'bandwidth'::public.credit_metric_type
    AND uoe.billing_cycle_start IS NOT DISTINCT FROM org_credit_cost.cycle_start
    AND uoe.billing_cycle_end IS NOT DISTINCT FROM org_credit_cost.cycle_end
  GROUP BY
    org_credit_cost.org_id,
    org_credit_cost.customer_id,
    org_credit_cost.plan_name,
    org_credit_cost.is_credit_only,
    org_credit_cost.plan_bandwidth,
    org_credit_cost.bandwidth_overage,
    org_credit_cost.is_good_plan,
    org_credit_cost.mau_percent,
    org_credit_cost.bandwidth_percent,
    org_credit_cost.storage_percent,
    org_credit_cost.build_time_percent,
    org_credit_cost.credit_cost_per_unit
),
org_credit_status AS (
  SELECT
    org_credit_debits.customer_id,
    org_credit_debits.is_credit_only,
    org_credit_debits.plan_name,
    org_credit_debits.plan_bandwidth,
    org_credit_debits.bandwidth_overage,
    org_credit_debits.is_good_plan,
    org_credit_debits.mau_percent,
    org_credit_debits.bandwidth_percent,
    org_credit_debits.storage_percent,
    org_credit_debits.build_time_percent,
    CASE
      WHEN org_credit_debits.bandwidth_overage <= 0 THEN 0::numeric
      WHEN COALESCE(org_credit_debits.credit_cost_per_unit, 0::numeric) > 0 THEN GREATEST(
        org_credit_debits.bandwidth_overage - LEAST(
          org_credit_debits.bandwidth_overage,
          org_credit_debits.existing_credits_debited / org_credit_debits.credit_cost_per_unit
        ),
        0::numeric
      )
      ELSE org_credit_debits.bandwidth_overage
    END AS bandwidth_unpaid_overage
  FROM org_credit_debits
),
org_final_status AS (
  SELECT
    org_credit_status.customer_id,
    org_credit_status.plan_name,
    org_credit_status.is_credit_only,
    org_credit_status.bandwidth_unpaid_overage,
    CASE
      WHEN org_credit_status.plan_name = 'Enterprise'
        AND NOT org_credit_status.is_credit_only
        THEN true
      WHEN org_credit_status.is_good_plan
        AND NOT org_credit_status.is_credit_only
        THEN true
      WHEN NOT org_credit_status.is_credit_only
        AND org_credit_status.bandwidth_unpaid_overage <= 0
        AND COALESCE(org_credit_status.mau_percent, 0::double precision) <= 100
        AND COALESCE(org_credit_status.bandwidth_percent, 0::double precision) <= 100
        AND COALESCE(org_credit_status.storage_percent, 0::double precision) <= 100
        AND COALESCE(org_credit_status.build_time_percent, 0::double precision) <= 100
        THEN true
      WHEN org_credit_status.is_credit_only
        AND org_credit_status.bandwidth_unpaid_overage <= 0
        AND COALESCE(org_credit_status.mau_percent, 0::double precision) = 0
        AND COALESCE(org_credit_status.bandwidth_percent, 0::double precision) = 0
        AND COALESCE(org_credit_status.storage_percent, 0::double precision) = 0
        AND COALESCE(org_credit_status.build_time_percent, 0::double precision) = 0
        THEN true
      ELSE false
    END AS is_good_plan,
    GREATEST(
      COALESCE(org_credit_status.mau_percent, 0::double precision),
      COALESCE(
        CASE
          WHEN COALESCE(org_credit_status.plan_bandwidth, 0) > 0
            AND org_credit_status.bandwidth_overage > 0
            THEN (
              (
                org_credit_status.plan_bandwidth::numeric
                + org_credit_status.bandwidth_unpaid_overage
              ) * 100::numeric / org_credit_status.plan_bandwidth::numeric
            )::double precision
          ELSE org_credit_status.bandwidth_percent
        END,
        0::double precision
      ),
      COALESCE(org_credit_status.storage_percent, 0::double precision),
      COALESCE(org_credit_status.build_time_percent, 0::double precision)
    ) AS total_percent
  FROM org_credit_status
)
UPDATE public.stripe_info AS si
SET
  bandwidth_exceeded = CASE
    WHEN (
      org_final_status.plan_name = 'Enterprise'
      AND NOT org_final_status.is_credit_only
    ) OR org_final_status.bandwidth_unpaid_overage <= 0
      THEN false
    ELSE si.bandwidth_exceeded
  END,
  is_good_plan = org_final_status.is_good_plan,
  plan_usage = COALESCE(ROUND(org_final_status.total_percent)::bigint, si.plan_usage),
  updated_at = now()
FROM org_final_status
WHERE si.customer_id = org_final_status.customer_id;
