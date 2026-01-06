DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;

CREATE POLICY "Allow org members to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], webhooks.org_id)),
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
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhooks.org_id)),
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
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhooks.org_id)),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
)
WITH CHECK (
    public.check_min_rights(
        'admin'::public.user_min_right,
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhooks.org_id)),
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
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhooks.org_id)),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow org members to select webhook_deliveries"
ON public.webhook_deliveries
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], webhook_deliveries.org_id)),
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
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhook_deliveries.org_id)),
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
        (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], webhook_deliveries.org_id)),
        org_id,
        null::CHARACTER VARYING,
        null::BIGINT
    )
);

CREATE POLICY "Allow org admin to select org member users"
ON public.users
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.org_users ou_target
        WHERE ou_target.user_id = users.id
        AND public.check_min_rights(
            'admin'::public.user_min_right,
            (SELECT public.get_identity_org_allowed('{all}'::public.key_mode[], ou_target.org_id)),
            ou_target.org_id,
            NULL::character varying,
            NULL::bigint
        )
    )
);
