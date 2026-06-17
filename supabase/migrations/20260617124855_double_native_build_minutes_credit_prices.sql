UPDATE public.plans
SET
  build_time_unit = CASE id
    WHEN '526e11d8-3c51-4581-ac92-4770c602f47c'::uuid THEN 3600::bigint
    WHEN '440cfd69-0cfd-486e-b59b-cb99f7ae76a0'::uuid THEN 7200::bigint
    WHEN 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'::uuid THEN 36000::bigint
    WHEN '745d7ab3-6cd6-4d65-b257-de6782d5ba50'::uuid THEN 1200000::bigint
    ELSE build_time_unit
  END,
  updated_at = now()
WHERE id IN (
  '526e11d8-3c51-4581-ac92-4770c602f47c'::uuid,
  '440cfd69-0cfd-486e-b59b-cb99f7ae76a0'::uuid,
  'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'::uuid,
  '745d7ab3-6cd6-4d65-b257-de6782d5ba50'::uuid
);


WITH desired_steps (step_min, step_max, price_per_unit, unit_factor) AS (
  VALUES
    (0::bigint, 6000::bigint, 0.08::double precision, 60::bigint),
    (6000::bigint, 30000::bigint, 0.07::double precision, 60::bigint),
    (30000::bigint, 60000::bigint, 0.06::double precision, 60::bigint),
    (60000::bigint, 300000::bigint, 0.05::double precision, 60::bigint),
    (300000::bigint, 600000::bigint, 0.045::double precision, 60::bigint),
    (600000::bigint, 9223372036854775807::bigint, 0.04::double precision, 60::bigint)
),
updated_steps AS (
  UPDATE public.capgo_credits_steps AS existing
  SET
    price_per_unit = desired_steps.price_per_unit,
    unit_factor = desired_steps.unit_factor
  FROM desired_steps
  WHERE existing.type = 'build_time'
    AND existing.org_id IS NULL
    AND existing.step_min = desired_steps.step_min
    AND existing.step_max = desired_steps.step_max
  RETURNING existing.step_min, existing.step_max
)
INSERT INTO public.capgo_credits_steps (
  type,
  step_min,
  step_max,
  price_per_unit,
  unit_factor,
  org_id
)
SELECT
  'build_time',
  desired_steps.step_min,
  desired_steps.step_max,
  desired_steps.price_per_unit,
  desired_steps.unit_factor,
  NULL
FROM desired_steps
WHERE NOT EXISTS (
  SELECT 1
  FROM updated_steps
  WHERE updated_steps.step_min = desired_steps.step_min
    AND updated_steps.step_max = desired_steps.step_max
);

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
      ELSE p.build_time_unit
    END AS plan_build_time_unit
  FROM public.orgs AS o
  JOIN public.stripe_info AS si ON si.customer_id = o.customer_id
  JOIN public.plans AS p ON p.stripe_id = si.product_id
  WHERE si.build_time_exceeded IS TRUE
    AND p.id IN (
      '526e11d8-3c51-4581-ac92-4770c602f47c'::uuid,
      '440cfd69-0cfd-486e-b59b-cb99f7ae76a0'::uuid,
      'abd76414-8f90-49a5-b3a4-8ff4d2e12c77'::uuid,
      '745d7ab3-6cd6-4d65-b257-de6782d5ba50'::uuid
    )
),
org_cycle AS (
  SELECT
    affected_orgs.org_id,
    affected_orgs.customer_id,
    affected_orgs.plan_name,
    affected_orgs.is_credit_only,
    affected_orgs.plan_build_time_unit,
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
    org_cycle.plan_build_time_unit,
    org_cycle.cycle_start,
    org_cycle.cycle_end,
    GREATEST(
      COALESCE(metrics.build_time_unit, 0)::numeric - COALESCE(org_cycle.plan_build_time_unit, 0)::numeric,
      0::numeric
    ) AS build_time_overage
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
    org_usage.plan_build_time_unit,
    org_usage.cycle_start,
    org_usage.cycle_end,
    org_usage.build_time_overage,
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
    org_plan_status.plan_build_time_unit,
    org_plan_status.is_credit_only,
    org_plan_status.cycle_start,
    org_plan_status.cycle_end,
    org_plan_status.build_time_overage,
    org_plan_status.is_good_plan,
    org_plan_status.mau_percent,
    org_plan_status.bandwidth_percent,
    org_plan_status.storage_percent,
    org_plan_status.build_time_percent,
    credit_cost.credit_cost_per_unit
  FROM org_plan_status
  CROSS JOIN LATERAL public.calculate_credit_cost(
    'build_time'::public.credit_metric_type,
    org_plan_status.build_time_overage
  ) AS credit_cost
),
org_credit_debits AS (
  SELECT
    org_credit_cost.org_id,
    org_credit_cost.customer_id,
    org_credit_cost.plan_name,
    org_credit_cost.is_credit_only,
    org_credit_cost.plan_build_time_unit,
    org_credit_cost.build_time_overage,
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
    AND uoe.metric = 'build_time'::public.credit_metric_type
    AND uoe.billing_cycle_start IS NOT DISTINCT FROM org_credit_cost.cycle_start
    AND uoe.billing_cycle_end IS NOT DISTINCT FROM org_credit_cost.cycle_end
  GROUP BY
    org_credit_cost.org_id,
    org_credit_cost.customer_id,
    org_credit_cost.plan_name,
    org_credit_cost.is_credit_only,
    org_credit_cost.plan_build_time_unit,
    org_credit_cost.build_time_overage,
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
    org_credit_debits.plan_build_time_unit,
    org_credit_debits.build_time_overage,
    org_credit_debits.is_good_plan,
    org_credit_debits.mau_percent,
    org_credit_debits.bandwidth_percent,
    org_credit_debits.storage_percent,
    org_credit_debits.build_time_percent,
    CASE
      WHEN org_credit_debits.build_time_overage <= 0 THEN 0::numeric
      WHEN COALESCE(org_credit_debits.credit_cost_per_unit, 0::numeric) > 0 THEN GREATEST(
        org_credit_debits.build_time_overage - LEAST(
          org_credit_debits.build_time_overage,
          org_credit_debits.existing_credits_debited / org_credit_debits.credit_cost_per_unit
        ),
        0::numeric
      )
      ELSE org_credit_debits.build_time_overage
    END AS build_time_unpaid_overage
  FROM org_credit_debits
),
org_final_status AS (
  SELECT
    org_credit_status.customer_id,
    org_credit_status.plan_name,
    org_credit_status.is_credit_only,
    org_credit_status.build_time_unpaid_overage,
    CASE
      WHEN org_credit_status.plan_name = 'Enterprise'
        AND NOT org_credit_status.is_credit_only
        THEN true
      WHEN org_credit_status.is_good_plan
        AND NOT org_credit_status.is_credit_only
        THEN true
      WHEN NOT org_credit_status.is_credit_only
        AND org_credit_status.build_time_unpaid_overage <= 0
        AND COALESCE(org_credit_status.mau_percent, 0::double precision) <= 100
        AND COALESCE(org_credit_status.bandwidth_percent, 0::double precision) <= 100
        AND COALESCE(org_credit_status.storage_percent, 0::double precision) <= 100
        THEN true
      WHEN org_credit_status.is_credit_only
        AND org_credit_status.build_time_unpaid_overage <= 0
        AND COALESCE(org_credit_status.mau_percent, 0::double precision) = 0
        AND COALESCE(org_credit_status.bandwidth_percent, 0::double precision) = 0
        AND COALESCE(org_credit_status.storage_percent, 0::double precision) = 0
        THEN true
      ELSE false
    END AS is_good_plan,
    GREATEST(
      COALESCE(org_credit_status.mau_percent, 0::double precision),
      COALESCE(org_credit_status.bandwidth_percent, 0::double precision),
      COALESCE(org_credit_status.storage_percent, 0::double precision),
      COALESCE(
        CASE
          WHEN COALESCE(org_credit_status.plan_build_time_unit, 0) > 0
            AND org_credit_status.build_time_overage > 0
            THEN (
              (
                org_credit_status.plan_build_time_unit::numeric
                + org_credit_status.build_time_unpaid_overage
              ) * 100::numeric / org_credit_status.plan_build_time_unit::numeric
            )::double precision
          ELSE org_credit_status.build_time_percent
        END,
        0::double precision
      )
    ) AS total_percent
  FROM org_credit_status
)
UPDATE public.stripe_info AS si
SET
  build_time_exceeded = CASE
    WHEN (
      org_final_status.plan_name = 'Enterprise'
      AND NOT org_final_status.is_credit_only
    ) OR org_final_status.build_time_unpaid_overage <= 0
      THEN false
    ELSE si.build_time_exceeded
  END,
  is_good_plan = org_final_status.is_good_plan,
  plan_usage = COALESCE(ROUND(org_final_status.total_percent)::bigint, si.plan_usage),
  updated_at = now()
FROM org_final_status
WHERE si.customer_id = org_final_status.customer_id;
