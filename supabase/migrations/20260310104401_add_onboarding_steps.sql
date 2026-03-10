-- Migration: Add onboarding_steps table
-- Tracks CLI/web/demo onboarding progress per org, replacing CLI temp files.
-- CLI accesses this table directly via Supabase SDK (no custom endpoint).

-- =============================================================================
-- 1) Create onboarding_steps table
-- =============================================================================
CREATE TABLE public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id CHARACTER VARYING,  -- nullable; set once CLI creates the app (step 2 of 13)
  source TEXT NOT NULL DEFAULT 'cli',  -- 'cli' | 'web' | 'demo'
  step_done SMALLINT NOT NULL DEFAULT 0,
  total_steps SMALLINT NOT NULL DEFAULT 13,
  step_payload JSONB DEFAULT '{}'::jsonb,  -- per-step metadata (pathToPackageJson, platform, etc.)
  completed_at TIMESTAMPTZ,  -- set when step_done >= total_steps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2) Indexes
-- =============================================================================
CREATE INDEX onboarding_steps_org_id_idx ON public.onboarding_steps (org_id);
CREATE INDEX onboarding_steps_org_source_idx ON public.onboarding_steps (org_id, source);

-- =============================================================================
-- 3) updated_at trigger (moddatetime extension)
-- =============================================================================
CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."onboarding_steps" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

-- =============================================================================
-- 4) Row Level Security
-- =============================================================================
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- SELECT: any org member with at least read access
CREATE POLICY "Allow org members to select onboarding_steps"
ON public.onboarding_steps
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

-- INSERT: org members with write access
CREATE POLICY "Allow org members to insert onboarding_steps"
ON public.onboarding_steps
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'write'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

-- UPDATE: org members with write access
CREATE POLICY "Allow org members to update onboarding_steps"
ON public.onboarding_steps
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'write'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        NULL::character varying,
        NULL::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'write'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

-- =============================================================================
-- 5) Grants
-- =============================================================================
GRANT ALL ON TABLE public.onboarding_steps TO service_role;
GRANT ALL ON TABLE public.onboarding_steps TO postgres;
