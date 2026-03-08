-- =============================================================================
-- Migration: Enforce API-key scoped org checks when API key header is present
--
-- If an authenticated user provides both a user session and a limited API key, we
-- must evaluate permissions against the API key identity first. This prevents user
-- session rights from bypassing org/app key scope and leaking webhook secrets.
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
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
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
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
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
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
        org_id,
        null::character varying,
        null::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
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
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
        org_id,
        null::character varying,
        null::bigint
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
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
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
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
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
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
        org_id,
        null::character varying,
        null::bigint
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        CASE
            WHEN public.get_apikey_header() IS NOT NULL
                THEN public.get_identity_org_allowed(
                    '{all,write,upload}'::public.key_mode[],
                    org_id
                )
            ELSE auth.uid()
        END,
        org_id,
        null::character varying,
        null::bigint
    )
);
