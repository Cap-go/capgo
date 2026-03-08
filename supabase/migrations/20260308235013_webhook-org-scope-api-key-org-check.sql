-- Ensure webhook and webhook_delivery access never bypasses API key org scoping.
--
-- If a request includes a capgkey header, evaluate permissions against the key
-- first, and only fall back to the authenticated user context when no key is
-- present.

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow org members to select webhooks" ON public.webhooks;

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

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;

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

DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;

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
