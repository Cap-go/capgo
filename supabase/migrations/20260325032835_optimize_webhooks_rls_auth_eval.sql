-- =============================================================================
-- Migration: Optimize webhook RLS auth/header evaluation
--
-- Webhook RLS policies branch on the request API key header and the current
-- authenticated user. When those lookups are referenced directly in a policy,
-- Postgres may re-evaluate them for each row. Wrap the row-independent calls in
-- SELECT so they are planned once per statement.
-- =============================================================================

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

CREATE POLICY "Allow admin to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

CREATE POLICY "Allow admin to insert webhooks"
ON public.webhooks
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

CREATE POLICY "Allow admin to update webhooks"
ON public.webhooks
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

CREATE POLICY "Allow admin to delete webhooks"
ON public.webhooks
FOR DELETE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

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
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{read,write,upload,all}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

CREATE POLICY "Allow admin to insert webhook_deliveries"
ON public.webhook_deliveries
FOR INSERT
TO authenticated, anon
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);

CREATE POLICY "Allow admin to update webhook_deliveries"
ON public.webhook_deliveries
FOR UPDATE
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN (SELECT public.get_apikey_header()) IS NOT NULL
                THEN public.get_identity_org_allowed_apikey_only(
                    '{all,write,upload}'::public.key_mode [],
                    org_id
                )
            ELSE (SELECT auth.uid())
        END,
        org_id,
        NULL::character varying,
        NULL::bigint
    )
);
