-- Remove duplicate global bandwidth tiers if a prior upsert inserted instead of updating.
DELETE FROM public.capgo_credits_steps AS duplicate
WHERE duplicate.type = 'bandwidth'
  AND duplicate.org_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.capgo_credits_steps AS keeper
    WHERE keeper.type = 'bandwidth'
      AND keeper.org_id IS NULL
      AND keeper.step_min = duplicate.step_min
      AND keeper.step_max = duplicate.step_max
      AND keeper.id < duplicate.id
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
