-- Add missing indexes for foreign keys to improve query performance

-- Index for capgo_credits_steps.org_id foreign key
CREATE INDEX IF NOT EXISTS idx_capgo_credits_steps_org_id
ON public.capgo_credits_steps(org_id);

-- Index for usage_credit_consumptions.overage_event_id foreign key
CREATE INDEX IF NOT EXISTS idx_usage_credit_consumptions_overage_event_id
ON public.usage_credit_consumptions(overage_event_id);

-- Index for usage_overage_events.credit_step_id foreign key
CREATE INDEX IF NOT EXISTS idx_usage_overage_events_credit_step_id
ON public.usage_overage_events(credit_step_id);
