-- Add upgrade tracking fields for revenue analytics
ALTER TABLE public.stripe_info
  ADD COLUMN IF NOT EXISTS upgraded_at timestamp with time zone;

COMMENT ON COLUMN public.stripe_info.upgraded_at IS 'Timestamp of last paid plan upgrade for the org';

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS upgraded_orgs integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.global_stats.upgraded_orgs IS 'Number of organizations that upgraded plans in the last 24 hours';
