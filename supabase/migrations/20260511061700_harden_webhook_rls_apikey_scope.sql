-- =============================================================================
-- Harden webhook RLS API-key identity resolution.
--
-- Route-level webhook handlers already reject app-scoped API keys and enforce
-- org API-key expiration policy before managing org-level webhooks. Direct
-- PostgREST access to webhooks/webhook_deliveries must fail closed with the
-- same constraints without changing non-webhook callers of the shared helper.
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

ALTER FUNCTION "public"."get_identity_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" (
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
    v_require_apikey_expiration boolean := false;
    v_max_apikey_expiration_days integer;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;

  IF api_key_text IS NULL THEN
    PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_NO_AUTH', jsonb_build_object('org_id', org_id));
    RETURN NULL;
  END IF;

  SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

  IF api_key.id IS NOT NULL AND api_key.mode = ANY(keymode) THEN
    -- Webhooks are organization-level resources. App-scoped API keys must not
    -- satisfy direct table policies even when their owner is an org admin.
    IF COALESCE(array_length(api_key.limited_to_apps, 1), 0) > 0 THEN
      PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_APP_SCOPED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_EXPIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    SELECT o.require_apikey_expiration, o.max_apikey_expiration_days
      INTO v_require_apikey_expiration, v_max_apikey_expiration_days
      FROM public.orgs o
      WHERE o.id = get_identity_webhook_org_allowed_apikey_only.org_id;

    IF COALESCE(v_require_apikey_expiration, false) AND api_key.expires_at IS NULL THEN
      PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_EXPIRATION_REQUIRED', jsonb_build_object('key_id', api_key.id, 'org_id', org_id));
      RETURN NULL;
    END IF;

    IF api_key.expires_at IS NOT NULL
      AND v_max_apikey_expiration_days IS NOT NULL
      AND api_key.expires_at > (now() + make_interval(days => v_max_apikey_expiration_days))
    THEN
      PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_EXPIRATION_TOO_LONG', jsonb_build_object('key_id', api_key.id, 'org_id', org_id, 'max_days', v_max_apikey_expiration_days));
      RETURN NULL;
    END IF;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      IF NOT (get_identity_webhook_org_allowed_apikey_only.org_id = ANY(api_key.limited_to_orgs)) THEN
        PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_UNALLOWED', jsonb_build_object('org_id', org_id));
        RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  PERFORM public.pg_log('deny: WEBHOOK_IDENTITY_ORG_NO_MATCH', jsonb_build_object('org_id', org_id));
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_identity_webhook_org_allowed_apikey_only" ("keymode" "public"."key_mode" [], "org_id" uuid) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."check_webhook_min_rights" (
  "min_right" "public"."user_min_right",
  "keymode" "public"."key_mode" [],
  "org_id" uuid,
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_apikey text;
  v_user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO v_apikey;

  IF v_apikey IS NOT NULL THEN
    SELECT public.get_identity_webhook_org_allowed_apikey_only(
      check_webhook_min_rights.keymode,
      check_webhook_min_rights.org_id
    ) INTO v_user_id;

    IF v_user_id IS NULL THEN
      RETURN false;
    END IF;
  ELSE
    SELECT auth.uid() INTO v_user_id;
  END IF;

  RETURN public.check_min_rights(
    min_right,
    v_user_id,
    org_id,
    app_id,
    channel_id
  );
END;
$$;

ALTER FUNCTION "public"."check_webhook_min_rights" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" [], "org_id" uuid, "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_webhook_min_rights" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" [], "org_id" uuid, "app_id" character varying, "channel_id" bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_webhook_min_rights" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" [], "org_id" uuid, "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."check_webhook_min_rights" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" [], "org_id" uuid, "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_webhook_min_rights" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" [], "org_id" uuid, "app_id" character varying, "channel_id" bigint) TO "service_role";

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

CREATE POLICY "Allow admin to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
    org_id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'read'::public.user_min_right,
    '{read,write,upload,all}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
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
  public.check_webhook_min_rights(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode [],
    org_id,
    NULL::character varying,
    NULL::bigint
  )
);
