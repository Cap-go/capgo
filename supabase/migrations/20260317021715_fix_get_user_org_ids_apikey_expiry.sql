CREATE OR REPLACE FUNCTION "public"."get_user_org_ids"() RETURNS TABLE (
  "org_id" "uuid"
) LANGUAGE "plpgsql"
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  v_user_id uuid;
  limited_orgs uuid[];
  has_limited_orgs boolean := false;
BEGIN
  SELECT "public"."get_apikey_header"() INTO api_key_text;
  v_user_id := NULL;

  -- Check for API key first, supporting both plain-text and hashed keys.
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RAISE EXCEPTION 'API key has expired';
    END IF;

    v_user_id := api_key.user_id;
    limited_orgs := api_key.limited_to_orgs;
    has_limited_orgs := COALESCE(array_length(limited_orgs, 1), 0) > 0;
  END IF;

  -- If no valid API key v_user_id yet, try to get from public.identity.
  IF v_user_id IS NULL THEN
    SELECT public.get_identity() INTO v_user_id;

    IF v_user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY
  WITH role_orgs AS (
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  legacy_orgs AS (
    SELECT org_users.org_id AS org_uuid
    FROM public.org_users
    WHERE org_users.user_id = v_user_id
  ),
  all_orgs AS (
    SELECT org_uuid FROM legacy_orgs
    UNION
    SELECT org_uuid FROM role_orgs
  )
  SELECT ao.org_uuid AS org_id
  FROM all_orgs ao
  WHERE ao.org_uuid IS NOT NULL
    AND (
      NOT has_limited_orgs
      OR ao.org_uuid = ANY(limited_orgs)
    );
END;
$$;

COMMENT ON FUNCTION "public"."get_user_org_ids"() IS
  'RBAC/legacy-aware org id list for authenticated user or API key (includes org_users and role_bindings membership).';
