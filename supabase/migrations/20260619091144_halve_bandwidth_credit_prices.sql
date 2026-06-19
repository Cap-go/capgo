-- Keep only the canonical global bandwidth tiers (TB-based boundaries).
DELETE FROM public.capgo_credits_steps
WHERE type = 'bandwidth'
  AND org_id IS NULL
  AND (step_min, step_max) NOT IN (
    (0::bigint, 1099511627776::bigint),
    (1099511627776::bigint, 2199023255552::bigint),
    (2199023255552::bigint, 6597069766656::bigint),
    (6597069766656::bigint, 13194139533312::bigint),
    (13194139533312::bigint, 27487790694400::bigint),
    (27487790694400::bigint, 69269232549888::bigint),
    (69269232549888::bigint, 139637976727552::bigint),
    (139637976727552::bigint, 9223372036854775807::bigint)
  );


UPDATE public.capgo_credits_steps
SET
  price_per_unit = CASE step_min
    WHEN 0::bigint THEN 0.06::double precision
    WHEN 1099511627776::bigint THEN 0.05::double precision
    WHEN 2199023255552::bigint THEN 0.0425::double precision
    WHEN 6597069766656::bigint THEN 0.035::double precision
    WHEN 13194139533312::bigint THEN 0.0275::double precision
    WHEN 27487790694400::bigint THEN 0.02::double precision
    WHEN 69269232549888::bigint THEN 0.015::double precision
    WHEN 139637976727552::bigint THEN 0.01::double precision
    ELSE price_per_unit
  END,
  updated_at = now()
WHERE type = 'bandwidth'
  AND org_id IS NULL;
