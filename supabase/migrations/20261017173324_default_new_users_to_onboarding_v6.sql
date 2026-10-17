-- Only future profiles receive V6. Persisted V4/V5 cohorts are unchanged.
-- Invitation-created profiles remain excluded by created_via_invite.
ALTER TABLE public.users
  ALTER COLUMN onboarding SET DEFAULT '{"version":6}'::jsonb;
