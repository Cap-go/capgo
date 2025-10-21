-- Seed usage credit rates for MAU, bandwidth, and storage

BEGIN;

DELETE FROM public.usage_credit_rates
WHERE plan_id IS NULL;

INSERT INTO public.usage_credit_rates (
  metric,
  plan_id,
  tier_min,
  tier_max,
  credit_cost_per_unit,
  unit_label,
  effective_from
)
VALUES
  ('mau', NULL, 0, 1000000, 0.003, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 1000000, 3000000, 0.0022, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 3000000, 10000000, 0.0016, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 10000000, 15000000, 0.0014, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 15000000, 25000000, 0.0011, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 25000000, 40000000, 0.0010, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 40000000, 100000000, 0.0009, 'per MAU', '2024-01-01T00:00:00Z'),
  ('mau', NULL, 100000000, NULL, 0.0007, 'per MAU', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 0, 1099511627776, 0.12, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 1099511627776, 2199023255552, 0.10, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 2199023255552, 6597069766656, 0.085, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 6597069766656, 13194139533312, 0.07, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 13194139533312, 27487790694400, 0.055, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 27487790694400, 69269232549888, 0.04, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 69269232549888, 139637976727552, 0.03, 'per GiB', '2024-01-01T00:00:00Z'),
  ('bandwidth', NULL, 139637976727552, NULL, 0.02, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 0, 1073741824, 0.09, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 1073741824, 6442450944, 0.08, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 6442450944, 26843545600, 0.065, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 26843545600, 67645734912, 0.05, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 67645734912, 268435456000, 0.04, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 268435456000, 687194767360, 0.03, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 687194767360, 1374389534720, 0.025, 'per GiB', '2024-01-01T00:00:00Z'),
  ('storage', NULL, 1374389534720, NULL, 0.021, 'per GiB', '2024-01-01T00:00:00Z');

COMMIT;
