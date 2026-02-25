-- =============================================================================
-- Migration: Fix webhook RLS policies for org-scoped API key isolation
--
-- The 20260107000000 migration introduced anon role support for webhook endpoints,
-- but still resolves identity through get_identity(...), which does not enforce
-- limited_to_orgs. This allows read-mode API keys scoped to a single org to read
-- webhook secrets and delivery logs from other orgs.
--
-- This migration switches webhook and webhook_deliveries RLS checks to
-- get_identity_org_allowed(..., org_id), so org restrictions from API keys are
-- enforced per row.
-- =============================================================================

-- =====================================================
-- Recreate webhooks policies with org-scoped API key identity
-- =====================================================

DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

CREATE POLICY "Allow org members to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

CREATE POLICY "Allow admin to insert webhooks"
ON public.webhooks
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

CREATE POLICY "Allow admin to update webhooks"
ON public.webhooks
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

CREATE POLICY "Allow admin to delete webhooks"
ON public.webhooks
FOR DELETE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

-- =====================================================
-- Recreate webhook_deliveries policies with org-scoped API key identity
-- =====================================================

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;

CREATE POLICY "Allow org members to select webhook_deliveries"
ON public.webhook_deliveries
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

CREATE POLICY "Allow admin to insert webhook_deliveries"
ON public.webhook_deliveries
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);

CREATE POLICY "Allow admin to update webhook_deliveries"
ON public.webhook_deliveries
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    org_id
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);
