BEGIN;

-- Normalize any legacy values before enforcing the whitelist.
UPDATE public.usage_credit_grants
SET source = 'manual'
WHERE
    source IS NULL
    OR source NOT IN ('manual', 'stripe_top_up');

ALTER TABLE public.usage_credit_grants
ADD CONSTRAINT usage_credit_grants_source_check
CHECK (source IN ('manual', 'stripe_top_up'));

COMMIT;
