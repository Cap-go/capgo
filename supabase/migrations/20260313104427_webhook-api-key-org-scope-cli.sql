-- =============================================================================
-- Migration: Enforce API-key scoped org checks when API key header is present
--
-- If an authenticated user provides both a user session and a limited API key, we
-- must evaluate permissions against the API key identity first. This prevents user
-- session rights from bypassing org/app key scope and leaking webhook secrets.
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed_apikey_only" (
  "keymode" "public"."key_mode" [],
  "org_id" uuid
) RETURNS uuid
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    api_key_text text;
    api_key record;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: IDENTITY_ORG_NO_AUTH', jsonb_build_object('org_id', org_id));
    RETURN NULL;
  END IF;

  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  -- Check if key was found (api_key.id will be NULL if no match) and mode matches
  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: IDENTITY_ORG_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    -- Check org restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: IDENTITY_ORG_UNALLOWED', jsonb_build_object('org_id', org_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: IDENTITY_ORG_NO_MATCH', jsonb_build_object('org_id', org_id));
  RETURN NULL;
END;
$$;

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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
                    '{read,write,upload,all}'::public.key_mode[],
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
                THEN public.get_identity_org_allowed_apikey_only(
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
