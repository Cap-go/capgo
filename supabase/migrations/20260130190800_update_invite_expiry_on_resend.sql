-- Refresh invite validity based on updated_at to support resends without mutating created_at.

CREATE OR REPLACE FUNCTION public.get_invite_by_magic_lookup(lookup text)
RETURNS TABLE (
    org_name text,
    org_logo text,
    role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.name AS org_name,
    o.logo AS org_logo,
    COALESCE(tmp.rbac_role_name, tmp.role::text) AS role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_members(
    "user_id" uuid, "guild_id" uuid
) RETURNS TABLE (
    aid bigint,
    uid uuid,
    email varchar,
    image_url varchar,
    role public.user_min_right,
    is_tmp boolean
) LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $$
BEGIN
  PERFORM user_id;
  RETURN QUERY
    -- Get existing org members
    SELECT o.id AS aid, users.id AS uid, users.email, users.image_url, o.user_right AS role, false AS is_tmp
    FROM public.org_users o
    JOIN public.users ON users.id = o.user_id
    WHERE o.org_id = get_org_members.guild_id
    AND public.is_member_of_org(users.id, o.org_id)
  UNION
    -- Get pending invitations from tmp_users
    SELECT
      ((SELECT COALESCE(MAX(id), 0) FROM public.org_users) + tmp.id)::bigint AS aid,
      tmp.future_uuid AS uid,
      tmp.email::varchar,
      ''::varchar AS image_url,
      public.transform_role_to_invite(tmp.role) AS role,
      true AS is_tmp
    FROM public.tmp_users tmp
    WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_members_rbac(p_org_id uuid)
RETURNS TABLE(
  user_id uuid,
  email character varying,
  image_url character varying,
  role_name text,
  role_id uuid,
  binding_id uuid,
  granted_at timestamp with time zone,
  is_invite boolean,
  is_tmp boolean,
  org_user_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  api_key_text text;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;

  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL, NULL, api_key_text) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  RETURN QUERY
  WITH rbac_members AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      r.name AS role_name,
      rb.role_id,
      rb.id AS binding_id,
      rb.granted_at,
      false AS is_invite,
      false AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.users u
    INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE r.scope_type = public.rbac_scope_org()
      AND r.name LIKE 'org_%'
  ),
  legacy_invites AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      COALESCE(
        ou.rbac_role_name,
        CASE public.transform_role_to_non_invite(ou.user_right)
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      ou.created_at AS granted_at,
      true AS is_invite,
      false AS is_tmp,
      ou.id AS org_user_id
    FROM public.org_users ou
    INNER JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = p_org_id
      AND ou.user_right::text LIKE 'invite_%'
  ),
  tmp_invites AS (
    SELECT
      tmp.future_uuid AS user_id,
      tmp.email,
      ''::character varying AS image_url,
      COALESCE(
        tmp.rbac_role_name,
        CASE tmp.role
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      GREATEST(tmp.updated_at, tmp.created_at) AS granted_at,
      true AS is_invite,
      true AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.tmp_users tmp
    WHERE tmp.org_id = p_org_id
      AND tmp.cancelled_at IS NULL
      AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days')
  )
  SELECT *
  FROM (
    SELECT * FROM rbac_members
    UNION ALL
    SELECT * FROM legacy_invites
    UNION ALL
    SELECT * FROM tmp_invites
  ) AS combined
  ORDER BY
    combined.is_invite,
    CASE combined.role_name
      WHEN public.rbac_role_org_super_admin() THEN 1
      WHEN public.rbac_role_org_admin() THEN 2
      WHEN public.rbac_role_org_billing_admin() THEN 3
      WHEN public.rbac_role_org_member() THEN 4
      ELSE 5
    END,
    combined.email;
END;
$$;
