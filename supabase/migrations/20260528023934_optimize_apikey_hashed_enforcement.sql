CREATE INDEX IF NOT EXISTS "orgs_enforce_hashed_api_keys_true_idx"
ON "public"."orgs" ("id")
WHERE "enforce_hashed_api_keys" = true;

CREATE OR REPLACE FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  scoped_enforced_org_exists boolean;
BEGIN
  IF apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL THEN
    RETURN true;
  END IF;

  IF apikey_row.rbac_id IS NULL THEN
    RETURN true;
  END IF;

  WITH enforced_orgs AS (
    SELECT public.orgs.id
    FROM public.orgs
    WHERE public.orgs.enforce_hashed_api_keys = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM enforced_orgs
    WHERE EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_org()
          AND rb.org_id = enforced_orgs.id
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.apps apps
          ON apps.id = rb.app_id
          AND apps.owner_org = enforced_orgs.id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_app()
          AND rb.app_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.channels channels
          ON channels.rbac_id = rb.channel_id
          AND channels.owner_org = enforced_orgs.id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_channel()
          AND rb.channel_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
  )
  INTO scoped_enforced_org_exists;

  IF scoped_enforced_org_exists THEN
    PERFORM public.pg_log(
      'deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('apikey_id', apikey_row.id, 'user_id', apikey_row.user_id)
    );
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") TO "service_role";

COMMENT ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("public"."apikeys") IS
'Rejects plaintext API keys when any scoped org requires hashed API keys. The lookup starts from enforcing orgs and indexed RBAC bindings so broad API keys do not scan every app binding on each permission check.';
