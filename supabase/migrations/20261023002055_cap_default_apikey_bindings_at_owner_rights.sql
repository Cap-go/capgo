-- Default API keys ("default org admin", "default app uploader",
-- "default app reader") are provisioned by the backend with the service
-- connection. Earlier provisioning bound them to fixed roles in every org the
-- owner had any binding in, so a key could hold more than its owner (for
-- example org_admin in an org where the owner is only org_member).
--
-- Provisioning now keeps a binding only when the owner holds every permission
-- of the bound role at the same scope. Remove existing default-key bindings
-- that fail that same check.

WITH default_key_bindings AS (
  SELECT
    role_bindings.id AS binding_id,
    role_bindings.role_id,
    role_bindings.scope_type,
    role_bindings.org_id,
    apps.app_id AS app_identifier,
    apikeys.user_id
  FROM public.role_bindings
  INNER JOIN public.apikeys
    ON apikeys.rbac_id = role_bindings.principal_id
  LEFT JOIN public.apps
    ON apps.id = role_bindings.app_id
  WHERE role_bindings.principal_type = public.rbac_principal_apikey()
    AND role_bindings.reason IN (
      'Default API key RBAC org binding',
      'Default API key RBAC app binding'
    )
    AND apikeys.name IN (
      'default org admin',
      'default app uploader',
      'default app reader'
    )
    AND role_bindings.org_id IS NOT NULL
    -- Owners who are org admins already hold every role the default keys get.
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_bindings AS owner_binding
      INNER JOIN public.roles AS owner_role
        ON owner_role.id = owner_binding.role_id
      WHERE owner_binding.principal_type = public.rbac_principal_user()
        AND owner_binding.principal_id = apikeys.user_id
        AND owner_binding.scope_type = public.rbac_scope_org()
        AND owner_binding.org_id = role_bindings.org_id
        AND owner_role.name IN (
          public.rbac_role_org_super_admin(),
          public.rbac_role_org_admin()
        )
        AND (owner_binding.expires_at IS NULL OR owner_binding.expires_at > pg_catalog.now())
    )
),
role_closure AS (
  WITH RECURSIVE closure(root_role_id, scope_type, role_id) AS (
    SELECT DISTINCT default_key_bindings.role_id, default_key_bindings.scope_type, default_key_bindings.role_id
    FROM default_key_bindings

    UNION

    SELECT closure.root_role_id, closure.scope_type, hierarchy.child_role_id
    FROM closure
    INNER JOIN public.role_hierarchy AS hierarchy
      ON hierarchy.parent_role_id = closure.role_id
    INNER JOIN public.roles AS child_role
      ON child_role.id = hierarchy.child_role_id
      AND child_role.scope_type = closure.scope_type
  )
  SELECT root_role_id, role_id FROM closure
),
role_permission_keys AS (
  SELECT DISTINCT role_closure.root_role_id, permissions.key
  FROM role_closure
  INNER JOIN public.role_permissions
    ON role_permissions.role_id = role_closure.role_id
  INNER JOIN public.permissions
    ON permissions.id = role_permissions.permission_id
),
excessive_bindings AS (
  SELECT default_key_bindings.binding_id
  FROM default_key_bindings
  WHERE EXISTS (
    SELECT 1
    FROM role_permission_keys
    WHERE role_permission_keys.root_role_id = default_key_bindings.role_id
      AND NOT public.rbac_has_permission(
        public.rbac_principal_user(),
        default_key_bindings.user_id,
        role_permission_keys.key,
        default_key_bindings.org_id,
        default_key_bindings.app_identifier,
        NULL::bigint
      )
  )
)
DELETE FROM public.role_bindings
USING excessive_bindings
WHERE role_bindings.id = excessive_bindings.binding_id;
