-- Move build minutes onto the same shared usage-credit ladder used for the other
-- overage metrics while lowering the effective build-minute pricing.
-- Keep the existing ranges and unit_factor so the generic credit engine can
-- continue pricing build_time without any special-case logic.

DELETE FROM public.capgo_credits_steps
WHERE type = 'build_time';

INSERT INTO public.capgo_credits_steps (
  type,
  step_min,
  step_max,
  price_per_unit,
  unit_factor,
  org_id
)
VALUES
  ('build_time', 0, 6000, 0.16, 60, NULL),
  ('build_time', 6000, 30000, 0.14, 60, NULL),
  ('build_time', 30000, 60000, 0.12, 60, NULL),
  ('build_time', 60000, 300000, 0.10, 60, NULL),
  ('build_time', 300000, 600000, 0.09, 60, NULL),
  ('build_time', 600000, 9223372036854775807, 0.08, 60, NULL);
