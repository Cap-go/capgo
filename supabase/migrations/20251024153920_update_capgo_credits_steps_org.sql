-- Add org ownership to credit steps and drop legacy stripe references

BEGIN;

ALTER TABLE public.capgo_credits_steps
ADD COLUMN org_id uuid REFERENCES public.orgs (id) ON DELETE SET NULL;

COMMENT ON COLUMN capgo_credits_steps.org_id IS 'Optional organization owner for this pricing tier';

ALTER TABLE public.capgo_credits_steps
DROP COLUMN stripe_id;

COMMIT;
