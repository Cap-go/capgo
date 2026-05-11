-- =============================================================================
-- Harden webhook RLS API-key identity resolution.
--
-- Route-level webhook handlers already reject app-scoped API keys and enforce
-- the org required-expiration API-key policy before managing org-level webhooks.
-- Direct PostgREST access to webhooks/webhook_deliveries must fail closed with
-- the same constraints without changing non-webhook callers of the shared helper.
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."webhook_allowed_org_ids" (
  "min_right" "public"."user_min_right",
  "keymode" "public"."key_mode" []
) RETURNS uuid[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid;
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_auth_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(v_api_key_text) INTO v_api_key;

    IF v_api_key.id IS NULL OR v_api_key.mode IS NULL OR NOT (v_api_key.mode = ANY(webhook_allowed_org_ids.keymode)) THEN
      PERFORM public.pg_log('deny: WEBHOOK_ALLOWED_ORGS_NO_MATCH', '{}'::jsonb);
      RETURN v_allowed;
    END IF;

    -- Webhooks are organization-level resources. App-scoped API keys must not
    -- satisfy direct table policies even when their owner is an org admin.
    IF COALESCE(array_length(v_api_key.limited_to_apps, 1), 0) > 0 THEN
      PERFORM public.pg_log('deny: WEBHOOK_ALLOWED_ORGS_APP_SCOPED', jsonb_build_object('key_id', v_api_key.id));
      RETURN v_allowed;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log('deny: WEBHOOK_ALLOWED_ORGS_EXPIRED', jsonb_build_object('key_id', v_api_key.id));
      RETURN v_allowed;
    END IF;

    v_user_id := v_api_key.user_id;
  ELSE
    v_user_id := v_auth_user_id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  WITH candidate_orgs AS (
    SELECT org_users.org_id
    FROM public.org_users
    WHERE org_users.user_id = v_user_id
      AND org_users.user_right >= webhook_allowed_org_ids.min_right
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    SELECT role_bindings.org_id
    FROM public.role_bindings
    WHERE role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND role_bindings.principal_type = public.rbac_principal_user()
      AND role_bindings.principal_id = v_user_id
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT role_bindings.org_id
    FROM public.role_bindings
    WHERE v_api_key_text IS NOT NULL
      AND v_api_key.rbac_id IS NOT NULL
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND role_bindings.principal_type = public.rbac_principal_apikey()
      AND role_bindings.principal_id = v_api_key.rbac_id
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    SELECT role_bindings.org_id
    FROM public.group_members
    INNER JOIN public.groups ON groups.id = group_members.group_id
    INNER JOIN public.role_bindings
      ON role_bindings.principal_type = public.rbac_principal_group()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id = groups.org_id
    WHERE group_members.user_id = v_user_id
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  )
  SELECT COALESCE(array_agg(DISTINCT candidate_orgs.org_id), '{}'::uuid[])
  INTO v_allowed
  FROM candidate_orgs
  INNER JOIN public.orgs ON orgs.id = candidate_orgs.org_id
  WHERE (
      v_api_key_text IS NULL
      OR COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) = 0
      OR candidate_orgs.org_id = ANY(v_api_key.limited_to_orgs)
    )
    AND (
      v_api_key_text IS NULL
      OR NOT COALESCE(orgs.require_apikey_expiration, false)
      OR v_api_key.expires_at IS NOT NULL
    )
    -- Candidate collection is intentionally broad; this exact check preserves
    -- legacy/RBAC permission semantics, 2FA, password policy, and API-key scope.
    AND public.check_min_rights(
      webhook_allowed_org_ids.min_right,
      v_user_id,
      candidate_orgs.org_id,
      NULL::character varying,
      NULL::bigint
    );

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) TO "service_role";

COMMENT ON FUNCTION "public"."webhook_allowed_org_ids" ("min_right" "public"."user_min_right", "keymode" "public"."key_mode" []) IS
'Returns org IDs whose webhook rows are accessible to the current authenticated user or Capgo API key. It evaluates candidate orgs from legacy/RBAC bindings once per statement, applies webhook-specific API-key constraints, then verifies each candidate with check_min_rights() so webhook RLS can filter by indexed org_id instead of invoking authorization helpers per row.';

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON public.webhooks;

CREATE POLICY "Allow admin to select webhooks"
ON public.webhooks
FOR SELECT
TO authenticated, anon
USING (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);

CREATE POLICY "Allow admin to insert webhooks"
ON public.webhooks
FOR INSERT
TO authenticated, anon
WITH CHECK (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);

CREATE POLICY "Allow admin to update webhooks"
ON public.webhooks
FOR UPDATE
TO authenticated, anon
USING (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
)
WITH CHECK (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);

CREATE POLICY "Allow admin to delete webhooks"
ON public.webhooks
FOR DELETE
TO authenticated, anon
USING (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);

DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON public.webhook_deliveries;
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON public.webhook_deliveries;

CREATE POLICY "Allow org members to select webhook_deliveries"
ON public.webhook_deliveries
FOR SELECT
TO authenticated, anon
USING (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'read'::public.user_min_right,
    '{read,write,upload,all}'::public.key_mode []
  )), '{}'::uuid[]))
);

CREATE POLICY "Allow admin to insert webhook_deliveries"
ON public.webhook_deliveries
FOR INSERT
TO authenticated, anon
WITH CHECK (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);

CREATE POLICY "Allow admin to update webhook_deliveries"
ON public.webhook_deliveries
FOR UPDATE
TO authenticated, anon
USING (
  org_id = ANY(COALESCE((SELECT public.webhook_allowed_org_ids(
    'admin'::public.user_min_right,
    '{all,write,upload}'::public.key_mode []
  )), '{}'::uuid[]))
);
