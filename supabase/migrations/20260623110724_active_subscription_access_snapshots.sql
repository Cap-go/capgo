ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS active_canceled_orgs integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS active_past_due_orgs integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.active_canceled_orgs IS
'Organizations canceled in Stripe but still inside the paid subscription period at snapshot time.';

COMMENT ON COLUMN public.global_stats.active_past_due_orgs IS
'Organizations in Stripe past_due status that still retain Capgo access until cancel or period end at snapshot time.';
