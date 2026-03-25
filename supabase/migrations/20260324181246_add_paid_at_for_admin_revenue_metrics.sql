ALTER TABLE public.stripe_info
ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

COMMENT ON COLUMN public.stripe_info.paid_at IS 'Timestamp when the org first became a paying customer';

UPDATE public.stripe_info
SET paid_at = created_at
WHERE paid_at IS NULL
  AND status = 'succeeded';

UPDATE public.stripe_info
SET paid_at = COALESCE(subscription_anchor_start, created_at)
WHERE paid_at IS NULL
  AND status IN ('canceled', 'failed', 'deleted')
  AND subscription_id IS NOT NULL
  AND canceled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS stripe_info_paid_at_idx
ON public.stripe_info (paid_at)
WHERE paid_at IS NOT NULL;
