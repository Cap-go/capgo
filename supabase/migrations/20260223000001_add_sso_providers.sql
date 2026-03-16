-- Migration: Add SSO providers table
-- Purpose: Enterprise SSO support (SAML 2.0) with DNS domain verification
-- SSO management uses org.update_settings permission

-- Enable citext extension for case-insensitive text
CREATE EXTENSION IF NOT EXISTS citext;

-- =============================================================================
-- 1) Create sso_providers table
-- =============================================================================
CREATE TABLE public.sso_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    domain citext NOT NULL UNIQUE, -- noqa: RF04
    provider_id text,
    status text NOT NULL DEFAULT 'pending_verification' CHECK (
        status IN (
            'pending_verification',
            'verified',
            'active',
            'disabled'
        )
    ),
    enforce_sso boolean NOT NULL DEFAULT false,
    dns_verification_token text NOT NULL,
    dns_verified_at timestamptz,
    metadata_url text,
    attribute_mapping jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index on org_id for org-scoped queries
CREATE INDEX idx_sso_providers_org_id ON public.sso_providers (org_id);

-- =============================================================================
-- 2) Trigger function for updated_at (with SET search_path = '')
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_sso_providers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER handle_sso_providers_updated_at
BEFORE UPDATE ON public.sso_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_sso_providers_updated_at();

-- =============================================================================
-- 3) Enable RLS
-- =============================================================================
ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4) RLS policies using get_identity_org_allowed (sso_providers has NO app_id)
--    One policy per operation. Both authenticated and anon roles.
-- =============================================================================

-- SELECT: org admins can read SSO providers
CREATE POLICY allow_org_admins_select_sso_providers
ON public.sso_providers
FOR SELECT
TO anon, authenticated
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

-- INSERT: org admins can create SSO providers
CREATE POLICY allow_org_admins_insert_sso_providers
ON public.sso_providers
FOR INSERT
TO anon, authenticated
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

-- UPDATE: org admins can update SSO providers
CREATE POLICY allow_org_admins_update_sso_providers
ON public.sso_providers
FOR UPDATE
TO anon, authenticated
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        null::character varying,
        null::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

-- DELETE: org super_admins can delete SSO providers
CREATE POLICY allow_org_super_admins_delete_sso_providers
ON public.sso_providers
FOR DELETE
TO anon, authenticated
USING (
    public.check_min_rights(
        'super_admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{all}'::public.key_mode [],
            org_id
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

-- =============================================================================
-- 5) Grant table permissions to roles
-- =============================================================================
GRANT ALL ON TABLE public.sso_providers TO anon;
GRANT ALL ON TABLE public.sso_providers TO authenticated;
GRANT ALL ON TABLE public.sso_providers TO service_role;

-- Grant function permissions
GRANT ALL ON FUNCTION public.update_sso_providers_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_sso_providers_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_sso_providers_updated_at() TO service_role;


-- =============================================================================
-- 6) SQL function to check if a domain has active SSO
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_domain_sso(p_domain text)
RETURNS TABLE (
    has_sso boolean,
    provider_id text,
    org_id uuid
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT
        true AS has_sso,
        sp.provider_id,
        sp.org_id
    FROM public.sso_providers AS sp
    WHERE sp."domain" = p_domain
      AND sp.status = 'active'
    LIMIT 1;
$$;

GRANT ALL ON FUNCTION public.check_domain_sso(text) TO anon;
GRANT ALL ON FUNCTION public.check_domain_sso(text) TO authenticated;
GRANT ALL ON FUNCTION public.check_domain_sso(text) TO service_role;
