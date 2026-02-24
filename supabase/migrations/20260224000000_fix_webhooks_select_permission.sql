-- =============================================================================
-- Migration: Restrict webhooks read access to admin keys only
--
-- Previously, org members with read permissions could query the webhooks table
-- through Supabase REST and retrieve the signing `secret`, which allows spoofed
-- webhook events. This keeps non-admin clients from reading secrets while still
-- allowing admin-managed access through existing authenticated flows.
-- =============================================================================

-- Ensure previous webhook SELECT policies are replaced with admin-only access.
DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;

CREATE POLICY "Allow admin to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (
            SELECT
                public.get_identity(
                    '{read,upload,write,all}'::public.key_mode []
                )
        ),
        org_id,
        null::character varying,
        null::bigint
    )
);
