CREATE OR REPLACE FUNCTION public.get_org_user_access_rbac(
    p_user_id uuid, p_org_id uuid
)
RETURNS TABLE (
    id uuid,
    principal_type text,
    principal_id uuid,
    role_id uuid,
    role_name text,
    role_description text,
    scope_type text,
    org_id uuid,
    app_id uuid,
    channel_id uuid,
    granted_at timestamptz,
    granted_by uuid,
    expires_at timestamptz,
    reason text,
    is_direct boolean,
    principal_name text,
    user_email text,
    group_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL::text, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.scope_type,
    rb.org_id,
    rb.app_id,
    rb.channel_id,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email::text
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name::text
      ELSE rb.principal_id::text
    END as principal_name,
    u.email::text as user_email,
    g.name::text as group_name
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.org_id = p_org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = p_user_id
  ORDER BY rb.granted_at DESC;
END;
$$;
