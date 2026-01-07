-- =============================================================================
-- Migration: Add anon role support to webhooks and webhook_deliveries RLS policies
--
-- This allows API key-based authentication (which uses anon role with capgkey header)
-- to access webhook endpoints through RLS, matching how other tables work.
-- The get_identity() function already supports reading the capgkey header and
-- returning the user_id, so we just need to add anon to the policy roles.
-- =============================================================================

-- =====================================================
-- Update webhooks table policies to include anon role
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

-- Recreate policies with both authenticated and anon roles
CREATE POLICY "Allow org members to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow admin to insert webhooks"
ON public.webhooks
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow admin to update webhooks"
ON public.webhooks
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow admin to delete webhooks"
ON public.webhooks
FOR DELETE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

-- =====================================================
-- Update webhook_deliveries table policies to include anon role
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;

-- Recreate policies with both authenticated and anon roles
CREATE POLICY "Allow org members to select webhook_deliveries"
ON public.webhook_deliveries
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow admin to insert webhook_deliveries"
ON public.webhook_deliveries
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow admin to update webhook_deliveries"
ON public.webhook_deliveries
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[])),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);
