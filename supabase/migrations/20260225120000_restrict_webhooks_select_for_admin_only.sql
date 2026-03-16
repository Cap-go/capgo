-- =============================================================================
-- Migration: Restrict webhook secret exposure to admin readers
--
-- Reverts the org-reader regression introduced in
-- 20260224153200_fix_webhook_rls_org_scoping.sql. Non-admin/API-key users
-- with read-only rights were able to query `public.webhooks` directly and read
-- signing `secret` values.
-- =============================================================================

-- Ensure only admin users can SELECT webhook rows.
DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;

CREATE POLICY "Allow admin to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
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
