-- supabase/migrations/20260120164949_fix_apikey_permissions_naming.sql
-- Fix API Key Permission Naming
-- Renames apikey.read_roles -> org.apikey_read_roles
-- Renames apikey.update_roles -> org.apikey_update_roles

BEGIN;

-- 1. Remove old incorrect permissions and their assignments
DELETE FROM public.role_permissions
WHERE permission_id IN (
  SELECT id FROM public.permissions WHERE key IN ('apikey.read_roles', 'apikey.update_roles')
);

DELETE FROM public.permissions
WHERE key IN ('apikey.read_roles', 'apikey.update_roles');

-- 2. Add new correct permissions
INSERT INTO public.permissions (key, scope_type, description)
VALUES
  ('org.apikey_read_roles', 'org', 'Read API key role bindings'),
  ('org.apikey_update_roles', 'org', 'Assign or update API key roles')
ON CONFLICT (key) DO NOTHING;

-- 3. Assign new permissions to admin roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('org.apikey_read_roles', 'org.apikey_update_roles')
WHERE r.name IN ('org_admin', 'org_super_admin')
ON CONFLICT DO NOTHING;

-- 4. Update assign_apikey_role to use new permission key
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

  -- Verify user has permission to assign roles in this org (Updated permission key)
  IF NOT public.rbac_has_permission(
    public.rbac_principal_user(), v_user_id, 'org.apikey_update_roles', p_org_id, NULL, NULL
  ) THEN
    -- Fallback to legacy check or org.update_user_roles if preferred, keeping simple for now
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

  -- Get app UUID if app_id is provided
  v_app_uuid := p_app_id;

  -- Verify the API Key has access to this org
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

  -- Insert or update the binding
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

-- 5. Update delete_apikey_role to use new permission key
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

  -- Verify permission to delete roles (Updated permission key)
  IF NOT public.rbac_has_permission(
    public.rbac_principal_user(), v_user_id, 'org.apikey_update_roles', v_binding.org_id, NULL, NULL
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

COMMIT;
