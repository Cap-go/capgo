CREATE OR REPLACE FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys")
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  user_has_hashed_key_enforced_org boolean;
BEGIN
  IF apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL THEN
    RETURN true;
  END IF;

  -- API keys are user-scoped and can reach org-agnostic RLS helpers such as
  -- apikey listing. Once any org for the user enforces hashed keys, reject
  -- legacy plain-text keys on the shared lookup path to keep both auth planes aligned.
  SELECT EXISTS (
    SELECT 1
    FROM public.orgs AS org
    WHERE org.enforce_hashed_api_keys = true
      AND org.id IN (
        SELECT org_uuid
        FROM (
          SELECT created_org.id AS org_uuid
          FROM public.orgs AS created_org
          WHERE created_org.created_by = apikey_row.user_id

          UNION

          SELECT org_user.org_id AS org_uuid
          FROM public.org_users AS org_user
          WHERE org_user.user_id = apikey_row.user_id
            AND org_user.user_right::text NOT LIKE 'invite_%'

          UNION

          SELECT rb.org_id AS org_uuid
          FROM public.role_bindings AS rb
          WHERE rb.principal_type = public.rbac_principal_user()
            AND rb.principal_id = apikey_row.user_id
            AND rb.org_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
            AND NOT EXISTS (
              SELECT 1
              FROM public.org_users AS invited_org_user
              WHERE invited_org_user.org_id = rb.org_id
                AND invited_org_user.user_id = apikey_row.user_id
                AND invited_org_user.user_right::text LIKE 'invite_%'
            )

          UNION

          SELECT rb.org_id AS org_uuid
          FROM public.role_bindings AS rb
          JOIN public.group_members AS gm ON gm.group_id = rb.principal_id
          WHERE rb.principal_type = public.rbac_principal_group()
            AND gm.user_id = apikey_row.user_id
            AND rb.org_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())

          UNION

          SELECT apps.owner_org AS org_uuid
          FROM public.role_bindings AS rb
          JOIN public.apps ON apps.id = rb.app_id
          WHERE rb.principal_type = public.rbac_principal_user()
            AND rb.principal_id = apikey_row.user_id
            AND rb.app_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
            AND NOT EXISTS (
              SELECT 1
              FROM public.org_users AS invited_org_user
              WHERE invited_org_user.org_id = apps.owner_org
                AND invited_org_user.user_id = apikey_row.user_id
                AND invited_org_user.user_right::text LIKE 'invite_%'
            )

          UNION

          SELECT apps.owner_org AS org_uuid
          FROM public.role_bindings AS rb
          JOIN public.apps ON apps.id = rb.app_id
          JOIN public.group_members AS gm ON gm.group_id = rb.principal_id
          WHERE rb.principal_type = public.rbac_principal_group()
            AND gm.user_id = apikey_row.user_id
            AND rb.app_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())

          UNION

          SELECT apps.owner_org AS org_uuid
          FROM public.role_bindings AS rb
          JOIN public.channels AS ch ON ch.rbac_id = rb.channel_id
          JOIN public.apps ON apps.app_id = ch.app_id
          WHERE rb.principal_type = public.rbac_principal_user()
            AND rb.principal_id = apikey_row.user_id
            AND rb.channel_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
            AND NOT EXISTS (
              SELECT 1
              FROM public.org_users AS invited_org_user
              WHERE invited_org_user.org_id = apps.owner_org
                AND invited_org_user.user_id = apikey_row.user_id
                AND invited_org_user.user_right::text LIKE 'invite_%'
            )

          UNION

          SELECT apps.owner_org AS org_uuid
          FROM public.role_bindings AS rb
          JOIN public.channels AS ch ON ch.rbac_id = rb.channel_id
          JOIN public.apps ON apps.app_id = ch.app_id
          JOIN public.group_members AS gm ON gm.group_id = rb.principal_id
          WHERE rb.principal_type = public.rbac_principal_group()
            AND gm.user_id = apikey_row.user_id
            AND rb.channel_id IS NOT NULL
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
        ) AS accessible_orgs
      )
  )
  INTO user_has_hashed_key_enforced_org;

  IF user_has_hashed_key_enforced_org THEN
    PERFORM public.pg_log(
      'deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('apikey_id', apikey_row.id, 'user_id', apikey_row.user_id)
    );
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text")
RETURNS SETOF "public"."apikeys"
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT apikey_row.*
  FROM public.apikeys AS apikey_row
  WHERE (
    apikey_row.key = key_value
    OR apikey_row.key_hash = encode(extensions.digest(key_value, 'sha256'), 'hex')
  )
    AND public.check_apikey_hashed_key_enforcement(apikey_row)
  LIMIT 1;
$$;

ALTER FUNCTION "public"."find_apikey_by_value"("key_value" "text") OWNER TO "postgres";
