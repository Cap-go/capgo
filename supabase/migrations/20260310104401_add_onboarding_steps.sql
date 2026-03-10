-- Migration: Add onboarding_steps table
-- Tracks CLI/web/demo onboarding progress per org, replacing CLI temp files.
-- CLI accesses this table directly via Supabase SDK (no custom endpoint).

-- =============================================================================
-- 1) Create onboarding_steps table
-- =============================================================================
CREATE TABLE public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id CHARACTER VARYING REFERENCES public.apps(app_id) ON DELETE SET NULL,  -- nullable; set once CLI creates the app (step 2 of 13)
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- the user who initiated the onboarding session
  source TEXT NOT NULL DEFAULT 'cli'
    CONSTRAINT onboarding_steps_source_check CHECK (source IN ('cli', 'web', 'demo')),
  step_done SMALLINT NOT NULL DEFAULT 0,
  total_steps SMALLINT NOT NULL DEFAULT 13,
  step_payload JSONB DEFAULT '{}'::jsonb,  -- per-step metadata (pathToPackageJson, platform, etc.)
  completed_at TIMESTAMPTZ,  -- set when step_done >= total_steps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_steps_progress_check CHECK (
    step_done BETWEEN 0 AND 13
    AND total_steps BETWEEN 1 AND 13
    AND step_done <= total_steps
  )
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

-- onboarding_steps is org-scoped. All policies use get_identity_org_allowed()
-- (not get_identity_org_appid) so that:
--   1. The permission check is always org-scoped — no app_id involvement in auth.
--   2. check_min_rights() routes through the RBAC system for RBAC orgs and the
--      legacy org_users check for non-RBAC orgs. No implicit NULL magic.
--   3. Works for both dashboard users (authenticated + auth.uid()) and CLI API
--      key users (anon + capgkey header).

-- SELECT: any org member with read access or above.
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

-- INSERT: org members with write access.
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

-- UPDATE: org members with write access.
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

-- DELETE: org members with write access.
CREATE POLICY "Allow org members to delete onboarding_steps"
ON public.onboarding_steps
FOR DELETE
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
);

-- =============================================================================
-- 5) Grants
-- =============================================================================
GRANT ALL ON TABLE public.onboarding_steps TO anon;
GRANT ALL ON TABLE public.onboarding_steps TO authenticated;
GRANT ALL ON TABLE public.onboarding_steps TO service_role;
GRANT ALL ON TABLE public.onboarding_steps TO postgres;
