-- Move build minutes onto the same shared usage-credit ladder used for the other
-- overage metrics while lowering the effective build-minute pricing.
-- Keep the existing ranges and update rows in place so historical
-- usage_overage_events.credit_step_id links remain attached to their original
-- pricing tiers.

WITH desired_steps (step_min, step_max, price_per_unit, unit_factor) AS (
  VALUES
    (0::bigint, 6000::bigint, 0.16::double precision, 60::bigint),
    (6000::bigint, 30000::bigint, 0.14::double precision, 60::bigint),
    (30000::bigint, 60000::bigint, 0.12::double precision, 60::bigint),
    (60000::bigint, 300000::bigint, 0.10::double precision, 60::bigint),
    (300000::bigint, 600000::bigint, 0.09::double precision, 60::bigint),
    (600000::bigint, 9223372036854775807::bigint, 0.08::double precision, 60::bigint)
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
