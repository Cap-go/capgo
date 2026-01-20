-- supabase/migrations/20260120153051_apikey_rbac_functions.sql
-- API Keys RBAC Support - Phase 2
-- This migration adds RPC functions for managing RBAC roles on API Keys

-- ============================================================================
-- 1) Add new permissions for API Key role management
-- ============================================================================

INSERT INTO public.permissions (key, scope_type, description)
VALUES
  ('apikey.read_roles', public.rbac_scope_org(), 'Read API key role bindings'),
  ('apikey.update_roles', public.rbac_scope_org(), 'Assign or update API key roles')
ON CONFLICT (key) DO NOTHING;

-- Assign these permissions to org_admin and org_super_admin roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('apikey.read_roles', 'apikey.update_roles')
WHERE r.name IN (public.rbac_role_org_admin(), public.rbac_role_org_super_admin())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2) Function: get_apikey_role_bindings
-- Returns all role bindings for a given API Key
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_apikey_role_bindings(
  p_apikey_id bigint
) RETURNS TABLE (
  binding_id uuid,
  role_id uuid,
  role_name text,
  role_description text,
  scope_type text,
  org_id uuid,
  org_name text,
  app_id uuid,
  app_name text,
  channel_id uuid,
  granted_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_apikey_rbac_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Verify the API Key belongs to the user
  SELECT rbac_id INTO v_apikey_rbac_id
  FROM public.apikeys
  WHERE id = p_apikey_id AND user_id = v_user_id;

  IF v_apikey_rbac_id IS NULL THEN
    RAISE EXCEPTION 'APIKEY_NOT_FOUND_OR_NOT_OWNER';
  END IF;

  -- Return all bindings for this API Key
  RETURN QUERY
  SELECT
    rb.id as binding_id,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.scope_type,
    rb.org_id,
    o.name as org_name,
    rb.app_id,
    a.name as app_name,
    rb.channel_id,
    rb.granted_at,
    rb.expires_at
  FROM public.role_bindings rb
  JOIN public.roles r ON r.id = rb.role_id
  LEFT JOIN public.orgs o ON o.id = rb.org_id
  LEFT JOIN public.apps a ON a.id = rb.app_id
  WHERE rb.principal_type = public.rbac_principal_apikey()
    AND rb.principal_id = v_apikey_rbac_id
  ORDER BY rb.granted_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_apikey_role_bindings(bigint) IS 'Returns all RBAC role bindings for a given API Key owned by the current user.';

-- ============================================================================
-- 3) Function: assign_apikey_role
-- Assigns a role to an API Key at a given scope
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_apikey_role(
  p_apikey_id bigint,
  p_role_name text,
  p_scope_type text,
  p_org_id uuid,
  p_app_id uuid DEFAULT NULL,
  p_channel_id bigint DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_apikey record;
  v_role_id uuid;
  v_role_scope text;
  v_channel_rbac_id uuid;
  v_app_uuid uuid;
  v_binding_id uuid;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Verify the API Key belongs to the user
  SELECT * INTO v_apikey FROM public.apikeys WHERE id = p_apikey_id AND user_id = v_user_id;
  IF v_apikey IS NULL THEN
    RAISE EXCEPTION 'APIKEY_NOT_FOUND_OR_NOT_OWNER';
  END IF;

  -- Verify user has permission to assign roles in this org
  IF NOT public.rbac_has_permission(
    public.rbac_principal_user(), v_user_id, public.rbac_perm_org_update_user_roles(), p_org_id, NULL, NULL
  ) THEN
    -- Fallback to legacy check
    IF NOT public.check_min_rights(public.rbac_right_admin(), v_user_id, p_org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_ASSIGN_ROLES';
    END IF;
  END IF;

  -- Get the role
  SELECT id, scope_type INTO v_role_id, v_role_scope
  FROM public.roles
  WHERE name = p_role_name AND is_assignable = true;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND_OR_NOT_ASSIGNABLE';
  END IF;

  -- Validate scope type matches role scope
  IF v_role_scope != p_scope_type THEN
    RAISE EXCEPTION 'ROLE_SCOPE_MISMATCH: Role % is for scope %, not %', p_role_name, v_role_scope, p_scope_type;
  END IF;

  -- Get channel rbac_id if needed
  IF p_channel_id IS NOT NULL THEN
    SELECT rbac_id INTO v_channel_rbac_id FROM public.channels WHERE id = p_channel_id;
    IF v_channel_rbac_id IS NULL THEN
      RAISE EXCEPTION 'CHANNEL_NOT_FOUND';
    END IF;
  END IF;

  -- Get app UUID if app_id is provided (app_id in params is the apps.id UUID)
  v_app_uuid := p_app_id;

  -- Verify the API Key has access to this org (via limited_to_orgs or no restriction)
  IF v_apikey.limited_to_orgs IS NOT NULL AND array_length(v_apikey.limited_to_orgs, 1) > 0 THEN
    IF NOT (p_org_id = ANY(v_apikey.limited_to_orgs)) THEN
      RAISE EXCEPTION 'APIKEY_NOT_AUTHORIZED_FOR_ORG';
    END IF;
  END IF;

  -- Validate scope requirements
  IF p_scope_type = public.rbac_scope_app() AND v_app_uuid IS NULL THEN
    RAISE EXCEPTION 'APP_ID_REQUIRED_FOR_APP_SCOPE';
  END IF;

  IF p_scope_type = public.rbac_scope_channel() AND (v_app_uuid IS NULL OR v_channel_rbac_id IS NULL) THEN
    RAISE EXCEPTION 'APP_AND_CHANNEL_REQUIRED_FOR_CHANNEL_SCOPE';
  END IF;

  -- Insert or update the binding (handles SSD via unique indexes)
  BEGIN
    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      app_id,
      channel_id,
      granted_by,
      expires_at,
      is_direct
    ) VALUES (
      public.rbac_principal_apikey(),
      v_apikey.rbac_id,
      v_role_id,
      p_scope_type,
      p_org_id,
      v_app_uuid,
      v_channel_rbac_id,
      v_user_id,
      p_expires_at,
      true
    )
    RETURNING id INTO v_binding_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Update existing binding for this scope
      UPDATE public.role_bindings
      SET
        role_id = v_role_id,
        expires_at = p_expires_at,
        granted_by = v_user_id,
        granted_at = now()
      WHERE principal_type = public.rbac_principal_apikey()
        AND principal_id = v_apikey.rbac_id
        AND scope_type = p_scope_type
        AND (
          (p_scope_type = public.rbac_scope_org() AND org_id = p_org_id) OR
          (p_scope_type = public.rbac_scope_app() AND app_id = v_app_uuid) OR
          (p_scope_type = public.rbac_scope_channel() AND channel_id = v_channel_rbac_id)
        )
      RETURNING id INTO v_binding_id;
  END;

  RETURN jsonb_build_object('status', 'OK', 'binding_id', v_binding_id);
END;
$$;

COMMENT ON FUNCTION public.assign_apikey_role(bigint, text, text, uuid, uuid, bigint, timestamptz) IS 'Assigns an RBAC role to an API Key at a given scope. Handles upsert for SSD compliance.';

-- ============================================================================
-- 4) Function: delete_apikey_role
-- Removes a role binding from an API Key
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_apikey_role(
  p_apikey_id bigint,
  p_binding_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_apikey record;
  v_binding record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_apikey FROM public.apikeys WHERE id = p_apikey_id AND user_id = v_user_id;
  IF v_apikey IS NULL THEN
    RAISE EXCEPTION 'APIKEY_NOT_FOUND_OR_NOT_OWNER';
  END IF;

  SELECT * INTO v_binding FROM public.role_bindings WHERE id = p_binding_id;
  IF v_binding IS NULL THEN
    RAISE EXCEPTION 'BINDING_NOT_FOUND';
  END IF;

  IF v_binding.principal_id != v_apikey.rbac_id THEN
    RAISE EXCEPTION 'BINDING_NOT_FOR_THIS_APIKEY';
  END IF;

  -- Verify permission to delete roles
  IF NOT public.rbac_has_permission(
    public.rbac_principal_user(), v_user_id, public.rbac_perm_org_update_user_roles(), v_binding.org_id, NULL, NULL
  ) THEN
    -- Fallback to legacy check
    IF NOT public.check_min_rights(public.rbac_right_admin(), v_user_id, v_binding.org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_DELETE_ROLES';
    END IF;
  END IF;

  DELETE FROM public.role_bindings WHERE id = p_binding_id;

  RETURN 'OK';
END;
$$;

COMMENT ON FUNCTION public.delete_apikey_role(bigint, uuid) IS 'Removes an RBAC role binding from an API Key.';

-- ============================================================================
-- 5) Function: get_available_roles_for_apikey
-- Returns assignable roles for a given scope type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_roles_for_apikey(
  p_scope_type text
) RETURNS TABLE (
  role_id uuid,
  role_name text,
  role_description text,
  scope_type text,
  priority_rank int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate scope type
  IF p_scope_type NOT IN (public.rbac_scope_org(), public.rbac_scope_app(), public.rbac_scope_channel()) THEN
    RAISE EXCEPTION 'INVALID_SCOPE_TYPE: Must be org, app, or channel';
  END IF;

  RETURN QUERY
  SELECT
    r.id as role_id,
    r.name as role_name,
    r.description as role_description,
    r.scope_type,
    r.priority_rank
  FROM public.roles r
  WHERE r.is_assignable = true
    AND r.scope_type = p_scope_type
    AND r.name NOT LIKE 'platform_%' -- Exclude platform roles
  ORDER BY r.priority_rank DESC;
END;
$$;

COMMENT ON FUNCTION public.get_available_roles_for_apikey(text) IS 'Returns all assignable RBAC roles for a given scope type (org, app, or channel).';

-- ============================================================================
-- 6) Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_apikey_role_bindings(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_apikey_role(bigint, text, text, uuid, uuid, bigint, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_apikey_role(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_roles_for_apikey(text) TO authenticated;
