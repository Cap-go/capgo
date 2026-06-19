WITH desired_steps (step_min, step_max, price_per_unit, unit_factor) AS (
  VALUES
    (0::bigint, 1099511627776::bigint, 0.06::double precision, 1073741824::bigint),
    (1099511627776::bigint, 2199023255552::bigint, 0.05::double precision, 1073741824::bigint),
    (2199023255552::bigint, 6597069766656::bigint, 0.0425::double precision, 1073741824::bigint),
    (6597069766656::bigint, 13194139533312::bigint, 0.035::double precision, 1073741824::bigint),
    (13194139533312::bigint, 27487790694400::bigint, 0.0275::double precision, 1073741824::bigint),
    (27487790694400::bigint, 69269232549888::bigint, 0.02::double precision, 1073741824::bigint),
    (69269232549888::bigint, 139637976727552::bigint, 0.015::double precision, 1073741824::bigint),
    (139637976727552::bigint, 9223372036854775807::bigint, 0.01::double precision, 1073741824::bigint)
),
updated_steps AS (
  UPDATE public.capgo_credits_steps AS existing
  SET
    price_per_unit = desired_steps.price_per_unit,
    unit_factor = desired_steps.unit_factor
  FROM desired_steps
  WHERE existing.type = 'bandwidth'
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
  'bandwidth',
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
