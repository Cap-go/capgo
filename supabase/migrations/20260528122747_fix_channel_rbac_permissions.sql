-- Keep legacy write/developer API keys compatible with channel creation while
-- preserving destructive channel deletes for admin-capable roles only.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
JOIN public.permissions ON permissions.key = public.rbac_perm_app_create_channel()
WHERE roles.name = public.rbac_role_app_developer()
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Allow insert for auth, api keys (write, all) (admin+)" ON public.channels;

CREATE POLICY "Allow insert for auth, api keys (create_channel)" ON public.channels
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = channels.app_id
      AND apps.owner_org = channels.owner_org
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_app_create_channel(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (write+)" ON public.channels;

CREATE POLICY "Allow update for auth, api keys (channel write)"
ON public.channels
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = channels.app_id
      AND apps.owner_org = channels.owner_org
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow delete for auth (admin+) (all apikey)" ON public.channels;

CREATE POLICY "Allow delete for auth, api keys (channel.delete)"
ON public.channels
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_delete(),
    owner_org,
    app_id,
    id
  )
);

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
<<get_org_perm_for_apikey>>
DECLARE
  apikey_user_id uuid;
  org_id uuid;
BEGIN
  SELECT user_id INTO apikey_user_id
  FROM public.find_apikey_by_value(apikey)
  LIMIT 1;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org INTO org_id
  FROM public.apps
  WHERE apps.app_id = get_org_perm_for_apikey.app_id
  LIMIT 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'NO_APP';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_transfer(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_update_user_roles(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_delete(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_update_settings(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_create_channel(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_update_settings(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_upload_bundle(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_read(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_read';
  END IF;

  PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.find_apikey_by_value(get_org_perm_for_apikey_v2.apikey)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE public.apps.app_id = get_org_perm_for_apikey_v2.app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN 'NO_APP';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_transfer(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_channel_delete(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
  THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_update_settings(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_app_create_channel(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_channel_update_settings(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
  THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_upload_bundle(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_read(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_read';
  END IF;

  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") OWNER TO "postgres";
