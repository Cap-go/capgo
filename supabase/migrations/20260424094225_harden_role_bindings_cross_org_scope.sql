-- Harden role bindings against cross-org scope forgery.
-- Security fix for GHSA-5r52-m8r9-7f8x.

DELETE FROM public.role_bindings AS rb
WHERE rb.scope_type = public.rbac_scope_app()
  AND rb.org_id IS NOT NULL
  AND rb.app_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.apps AS a
    WHERE a.id = rb.app_id
      AND a.owner_org = rb.org_id
  );

DELETE FROM public.role_bindings AS rb
WHERE rb.scope_type = public.rbac_scope_channel()
  AND rb.org_id IS NOT NULL
  AND rb.app_id IS NOT NULL
  AND rb.channel_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.channels AS ch
    JOIN public.apps AS a
      ON a.app_id = ch.app_id
    WHERE ch.rbac_id = rb.channel_id
      AND a.id = rb.app_id
      AND ch.owner_org = rb.org_id
      AND a.owner_org = rb.org_id
  );

CREATE OR REPLACE FUNCTION public.rbac_has_permission(
  p_principal_type text,
  p_principal_id uuid,
  p_permission_key text,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_app_uuid uuid;
  v_app_owner_org uuid;
  v_channel_uuid uuid;
  v_channel_app_id text;
  v_channel_org_id uuid;
  v_has boolean := false;
BEGIN
  IF p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve scope identifiers to UUIDs. Preserve the caller org when the app does not exist yet.
  IF p_app_id IS NOT NULL THEN
    SELECT id, owner_org INTO v_app_uuid, v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NOT NULL THEN
      v_org_id := v_app_owner_org;
    END IF;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT rbac_id, app_id, owner_org INTO v_channel_uuid, v_channel_app_id, v_channel_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_uuid IS NOT NULL THEN
      IF v_app_uuid IS NULL THEN
        SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = v_channel_app_id LIMIT 1;
      END IF;
      IF v_org_id IS NULL THEN
        v_org_id := v_channel_org_id;
      END IF;
    END IF;
  END IF;

  WITH RECURSIVE scope_catalog AS (
    SELECT public.rbac_scope_platform()::text AS scope_type, NULL::uuid AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id
    UNION ALL
    SELECT public.rbac_scope_org()::text AS scope_type, v_org_id AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id WHERE v_org_id IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_app(), v_org_id, v_app_uuid, NULL::uuid WHERE v_app_uuid IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_channel(), v_org_id, v_app_uuid, v_channel_uuid WHERE v_channel_uuid IS NOT NULL
  ),
  direct_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.role_bindings rb ON rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_platform()) OR
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.org_id = s.org_id AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.org_id = s.org_id AND rb.app_id = s.app_id AND rb.channel_id = s.channel_id)
      )
    WHERE rb.principal_type = p_principal_type
      AND rb.principal_id = p_principal_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  group_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.group_members gm ON gm.user_id = p_principal_id
    JOIN public.groups g ON g.id = gm.group_id
    JOIN public.role_bindings rb ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = gm.group_id
    WHERE p_principal_type = public.rbac_principal_user()
      AND rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.org_id = s.org_id AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.org_id = s.org_id AND rb.app_id = s.app_id AND rb.channel_id = s.channel_id)
      )
      AND (v_org_id IS NULL OR g.org_id = v_org_id)
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  combined_roles AS (
    SELECT role_id FROM direct_roles
    UNION
    SELECT role_id FROM group_roles
  ),
  role_closure AS (
    SELECT role_id FROM combined_roles
    UNION
    SELECT rh.child_role_id
    FROM public.role_hierarchy rh
    JOIN role_closure rc ON rc.role_id = rh.parent_role_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM role_closure rc
    JOIN public.role_permissions rp ON rp.role_id = rc.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE p.key = p_permission_key
  )
  INTO v_has;

  RETURN COALESCE(v_has, false);
END;
$$;

ALTER FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) TO service_role;

COMMENT ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) IS
  'Checks whether a principal has a permission at org/app/channel scope. App and channel bindings must match the resolved owning org so forged cross-org scope rows are ignored.';
