CREATE OR REPLACE FUNCTION "public"."usage_credit_readable_org_ids"()
RETURNS uuid[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_check_user_id uuid;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT public.get_apikey_header() INTO v_api_key_text;
    IF v_api_key_text IS NULL THEN
      RETURN v_allowed;
    END IF;

    SELECT *
    FROM public.find_apikey_by_value(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NULL THEN
      RETURN v_allowed;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    IF v_api_key.mode IS NOT NULL THEN
      IF NOT (v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[])) THEN
        RETURN v_allowed;
      END IF;

      -- Legacy-mode API keys inherit their owner's org-level grants.
      v_user_id := v_api_key.user_id;
    END IF;
  END IF;

  IF v_api_key.id IS NULL OR v_api_key.mode IS NOT NULL THEN
    v_check_user_id := v_user_id;
  END IF;

  WITH candidate_orgs AS (
    -- Legacy org-scoped admin grants can read usage credit data.
    SELECT org_users.org_id
    FROM public.org_users
    WHERE v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'admin'::public.user_min_right
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    -- RBAC org-scoped direct user/API-key bindings are exact-checked below.
    SELECT role_bindings.org_id
    FROM public.role_bindings
    WHERE role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
      AND (
        (
          v_user_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_user()
          AND role_bindings.principal_id = v_user_id
        )
        OR (
          v_api_key.rbac_id IS NOT NULL
          AND role_bindings.principal_type = public.rbac_principal_apikey()
          AND role_bindings.principal_id = v_api_key.rbac_id
        )
      )

    UNION

    -- RBAC group org-scoped bindings are user-only and exact-checked below.
    SELECT role_bindings.org_id
    FROM public.group_members
    INNER JOIN public.groups ON groups.id = group_members.group_id
    INNER JOIN public.role_bindings
      ON role_bindings.principal_type = public.rbac_principal_group()
      AND role_bindings.principal_id = group_members.group_id
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id = groups.org_id
    WHERE v_user_id IS NOT NULL
      AND group_members.user_id = v_user_id
      AND role_bindings.org_id IS NOT NULL
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())
  )
  SELECT COALESCE(array_agg(DISTINCT candidate_orgs.org_id), '{}'::uuid[])
  INTO v_allowed
  FROM candidate_orgs
  WHERE (
      v_api_key.id IS NULL
      OR COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) = 0
      OR candidate_orgs.org_id = ANY(v_api_key.limited_to_orgs)
    )
    -- Candidate collection is intentionally broad; this exact check preserves
    -- legacy/RBAC permission semantics, 2FA, password policy, and API-key scope.
    AND public.check_min_rights(
      'admin'::public.user_min_right,
      v_check_user_id,
      candidate_orgs.org_id,
      NULL::character varying,
      NULL::bigint
    );

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."usage_credit_readable_org_ids"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."usage_credit_readable_org_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."usage_credit_readable_org_ids"() IS
'Returns org IDs whose usage-credit rows are readable by the current authenticated user or Capgo API key. It evaluates candidate orgs from legacy/RBAC bindings once per statement, then verifies each candidate with check_min_rights() to avoid per-row RLS work while preserving authorization semantics.';

DROP POLICY IF EXISTS "Allow org members to select usage_overage_events"
ON "public"."usage_overage_events";

CREATE POLICY "Allow org members to select usage_overage_events"
ON "public"."usage_overage_events"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(
    COALESCE((SELECT "public"."usage_credit_readable_org_ids"()), '{}'::uuid[])
  )
);

DROP POLICY IF EXISTS "Allow org members to select usage_credit_consumptions"
ON "public"."usage_credit_consumptions";

CREATE POLICY "Allow org members to select usage_credit_consumptions"
ON "public"."usage_credit_consumptions"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(
    COALESCE((SELECT "public"."usage_credit_readable_org_ids"()), '{}'::uuid[])
  )
);

DROP POLICY IF EXISTS "Allow org members to select usage_credit_grants"
ON "public"."usage_credit_grants";

CREATE POLICY "Allow org members to select usage_credit_grants"
ON "public"."usage_credit_grants"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(
    COALESCE((SELECT "public"."usage_credit_readable_org_ids"()), '{}'::uuid[])
  )
);

DROP POLICY IF EXISTS "Allow org members to select usage_credit_transactions"
ON "public"."usage_credit_transactions";

CREATE POLICY "Allow org members to select usage_credit_transactions"
ON "public"."usage_credit_transactions"
FOR SELECT
TO "anon", "authenticated"
USING (
  "org_id" = ANY(
    COALESCE((SELECT "public"."usage_credit_readable_org_ids"()), '{}'::uuid[])
  )
);
