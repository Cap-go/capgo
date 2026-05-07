CREATE OR REPLACE FUNCTION "public"."usage_credit_readable_org_ids"()
RETURNS uuid[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_auth_user_id uuid;
  v_user_id uuid;
  v_check_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_has_valid_api_key boolean := false;
  v_user_candidates_need_key_scope boolean := false;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_auth_user_id;
  v_user_id := v_auth_user_id;
  v_check_user_id := v_auth_user_id;

  SELECT public.get_apikey_header() INTO v_api_key_text;
  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    FROM public.find_apikey_by_value(v_api_key_text)
    INTO v_api_key;

    v_has_valid_api_key := v_api_key.id IS NOT NULL
      AND NOT public.is_apikey_expired(v_api_key.expires_at);

    IF v_auth_user_id IS NULL AND v_has_valid_api_key THEN
      v_check_user_id := v_api_key.user_id;

      IF v_api_key.mode IS NOT NULL THEN
        IF v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[]) THEN
          -- Legacy-mode API keys inherit their owner's org-level grants and stay
          -- restricted to the key's configured org scope.
          v_user_id := v_api_key.user_id;
          v_user_candidates_need_key_scope := true;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_user_id IS NULL AND NOT v_has_valid_api_key THEN
    RETURN v_allowed;
  END IF;

  WITH candidate_orgs AS (
    -- Authenticated-user candidates are not limited by any accompanying API key;
    -- legacy API-key owner candidates are limited by that key's org scope.
    SELECT org_users.org_id, v_user_candidates_need_key_scope AS needs_api_key_scope
    FROM public.org_users
    WHERE v_user_id IS NOT NULL
      AND org_users.user_id = v_user_id
      AND org_users.user_right >= 'admin'::public.user_min_right
      AND org_users.app_id IS NULL
      AND org_users.channel_id IS NULL

    UNION

    SELECT role_bindings.org_id, v_user_candidates_need_key_scope AS needs_api_key_scope
    FROM public.role_bindings
    WHERE v_user_id IS NOT NULL
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND role_bindings.principal_type = public.rbac_principal_user()
      AND role_bindings.principal_id = v_user_id
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    -- API-key RBAC candidates are available even when the request also carries a
    -- user JWT, matching check_min_rights() mixed-auth behavior.
    SELECT role_bindings.org_id, true AS needs_api_key_scope
    FROM public.role_bindings
    WHERE v_has_valid_api_key
      AND v_api_key.rbac_id IS NOT NULL
      AND role_bindings.scope_type = public.rbac_scope_org()
      AND role_bindings.org_id IS NOT NULL
      AND role_bindings.principal_type = public.rbac_principal_apikey()
      AND role_bindings.principal_id = v_api_key.rbac_id
      AND (role_bindings.expires_at IS NULL OR role_bindings.expires_at > now())

    UNION

    -- RBAC group org-scoped bindings are user-only and exact-checked below.
    SELECT role_bindings.org_id, v_user_candidates_need_key_scope AS needs_api_key_scope
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
      NOT candidate_orgs.needs_api_key_scope
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

DROP POLICY IF EXISTS "Deny insert for org members"
ON "public"."usage_overage_events";

CREATE POLICY "Deny insert for org members"
ON "public"."usage_overage_events"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update for org members"
ON "public"."usage_overage_events";

CREATE POLICY "Deny update for org members"
ON "public"."usage_overage_events"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete for org members"
ON "public"."usage_overage_events";

CREATE POLICY "Deny delete for org members"
ON "public"."usage_overage_events"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);

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

DROP POLICY IF EXISTS "Deny insert for org members"
ON "public"."usage_credit_consumptions";

CREATE POLICY "Deny insert for org members"
ON "public"."usage_credit_consumptions"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update for org members"
ON "public"."usage_credit_consumptions";

CREATE POLICY "Deny update for org members"
ON "public"."usage_credit_consumptions"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete for org members"
ON "public"."usage_credit_consumptions";

CREATE POLICY "Deny delete for org members"
ON "public"."usage_credit_consumptions"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);

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

DROP POLICY IF EXISTS "Deny insert for org members"
ON "public"."usage_credit_grants";

CREATE POLICY "Deny insert for org members"
ON "public"."usage_credit_grants"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update for org members"
ON "public"."usage_credit_grants";

CREATE POLICY "Deny update for org members"
ON "public"."usage_credit_grants"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete for org members"
ON "public"."usage_credit_grants";

CREATE POLICY "Deny delete for org members"
ON "public"."usage_credit_grants"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);

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

DROP POLICY IF EXISTS "Deny insert for org members"
ON "public"."usage_credit_transactions";

CREATE POLICY "Deny insert for org members"
ON "public"."usage_credit_transactions"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update for org members"
ON "public"."usage_credit_transactions";

CREATE POLICY "Deny update for org members"
ON "public"."usage_credit_transactions"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete for org members"
ON "public"."usage_credit_transactions";

CREATE POLICY "Deny delete for org members"
ON "public"."usage_credit_transactions"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);
