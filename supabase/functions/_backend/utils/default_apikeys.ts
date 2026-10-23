/**
 * SQL used by createApiKey() to provision the three default API keys of a user
 * (`$1` = user id) together with their RBAC role bindings.
 *
 * Default keys run with the service connection, which bypasses the
 * caller-rank checks applied to user-initiated role bindings. The keys must
 * therefore never be granted more than their owner holds:
 *
 * - every candidate binding (key, role, scope) is kept only when the owner
 *   holds every permission of that role (including its role_hierarchy
 *   children) at the same org/app scope, checked with rbac_has_permission();
 * - "default org admin" gets org_admin only where the owner already has all
 *   org_admin permissions (org_admin / org_super_admin). In other orgs it
 *   mirrors the owner's own org-scoped roles instead;
 * - "default app uploader" / "default app reader" get org_member and
 *   app_uploader / app_reader only where the owner already has those rights.
 */
export const CREATE_DEFAULT_API_KEYS_SQL = `WITH RECURSIVE default_keys(name) AS (
  VALUES
    ('default org admin'),
    ('default app uploader'),
    ('default app reader')
),
inserted AS (
  INSERT INTO public.apikeys (
    user_id,
    key,
    key_hash,
    name
  )
  SELECT
    $1::uuid,
    gen_random_uuid()::text,
    NULL,
    default_key.name
  FROM default_keys AS default_key
  RETURNING user_id, rbac_id, name
),
current_orgs AS (
  SELECT DISTINCT rb.org_id
  FROM public.role_bindings rb
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = $1::uuid
    AND rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())

  UNION

  SELECT DISTINCT g.org_id
  FROM public.group_members gm
  INNER JOIN public.groups g ON g.id = gm.group_id
  INNER JOIN public.role_bindings rb
    ON rb.principal_type = public.rbac_principal_group()
    AND rb.principal_id = gm.group_id
    AND rb.org_id = g.org_id
  WHERE gm.user_id = $1::uuid
    AND rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
),
owner_org_roles AS (
  SELECT rb.org_id, rb.role_id
  FROM public.role_bindings rb
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = $1::uuid
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())

  UNION

  SELECT rb.org_id, rb.role_id
  FROM public.group_members gm
  INNER JOIN public.groups g ON g.id = gm.group_id
  INNER JOIN public.role_bindings rb
    ON rb.principal_type = public.rbac_principal_group()
    AND rb.principal_id = gm.group_id
    AND rb.org_id = g.org_id
  WHERE gm.user_id = $1::uuid
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id IS NOT NULL
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
),
base_candidates AS (
  SELECT
    candidate.name,
    roles.id AS role_id,
    roles.scope_type,
    current_orgs.org_id,
    NULL::uuid AS app_uuid,
    NULL::varchar AS app_identifier
  FROM (
    VALUES
      ('default org admin', public.rbac_role_org_admin()),
      ('default app uploader', public.rbac_role_org_member()),
      ('default app reader', public.rbac_role_org_member())
  ) AS candidate(name, role_name)
  CROSS JOIN current_orgs
  JOIN public.roles roles
    ON roles.name = candidate.role_name
    AND roles.scope_type = public.rbac_scope_org()

  UNION ALL

  SELECT
    candidate.name,
    roles.id,
    roles.scope_type,
    apps.owner_org,
    apps.id,
    apps.app_id
  FROM (
    VALUES
      ('default app uploader', public.rbac_role_app_uploader()),
      ('default app reader', public.rbac_role_app_reader())
  ) AS candidate(name, role_name)
  CROSS JOIN current_orgs
  JOIN public.apps apps ON apps.owner_org = current_orgs.org_id
  JOIN public.roles roles
    ON roles.name = candidate.role_name
    AND roles.scope_type = public.rbac_scope_app()
),
candidate_roles AS (
  SELECT DISTINCT role_id, scope_type
  FROM base_candidates

  UNION

  SELECT DISTINCT owner_org_roles.role_id, public.rbac_scope_org()
  FROM owner_org_roles
),
role_closure(root_role_id, scope_type, role_id) AS (
  SELECT candidate_roles.role_id, candidate_roles.scope_type, candidate_roles.role_id
  FROM candidate_roles

  UNION

  SELECT role_closure.root_role_id, role_closure.scope_type, hierarchy.child_role_id
  FROM role_closure
  JOIN public.role_hierarchy hierarchy
    ON hierarchy.parent_role_id = role_closure.role_id
  JOIN public.roles child_role
    ON child_role.id = hierarchy.child_role_id
    AND child_role.scope_type = role_closure.scope_type
),
role_permission_keys AS (
  SELECT DISTINCT role_closure.root_role_id, permissions.key
  FROM role_closure
  JOIN public.role_permissions role_permissions
    ON role_permissions.role_id = role_closure.role_id
  JOIN public.permissions permissions
    ON permissions.id = role_permissions.permission_id
),
owner_covered_candidates AS (
  SELECT base_candidates.*
  FROM base_candidates
  WHERE NOT EXISTS (
    SELECT 1
    FROM role_permission_keys
    WHERE role_permission_keys.root_role_id = base_candidates.role_id
      AND NOT public.rbac_has_permission(
        public.rbac_principal_user(),
        $1::uuid,
        role_permission_keys.key,
        base_candidates.org_id,
        base_candidates.app_identifier,
        NULL::bigint
      )
  )
),
mirrored_admin_candidates AS (
  -- Orgs where the owner is not an org admin: the admin key mirrors the
  -- owner's own org-scoped roles, never anything above them.
  SELECT DISTINCT
    'default org admin'::text AS name,
    owner_org_roles.role_id,
    public.rbac_scope_org() AS scope_type,
    owner_org_roles.org_id,
    NULL::uuid AS app_uuid,
    NULL::varchar AS app_identifier
  FROM owner_org_roles
  JOIN public.roles roles ON roles.id = owner_org_roles.role_id
  WHERE roles.scope_type = public.rbac_scope_org()
    AND roles.name <> public.rbac_role_org_super_admin()
    AND NOT EXISTS (
      SELECT 1
      FROM owner_covered_candidates
      WHERE owner_covered_candidates.name = 'default org admin'
        AND owner_covered_candidates.org_id = owner_org_roles.org_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM role_permission_keys
      WHERE role_permission_keys.root_role_id = owner_org_roles.role_id
        AND NOT public.rbac_has_permission(
          public.rbac_principal_user(),
          $1::uuid,
          role_permission_keys.key,
          owner_org_roles.org_id,
          NULL::varchar,
          NULL::bigint
        )
    )
),
allowed_bindings AS (
  SELECT name, role_id, scope_type, org_id, app_uuid FROM owner_covered_candidates
  UNION
  SELECT name, role_id, scope_type, org_id, app_uuid FROM mirrored_admin_candidates
)
INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  app_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_apikey(),
  inserted.rbac_id,
  allowed_bindings.role_id,
  allowed_bindings.scope_type,
  allowed_bindings.org_id,
  allowed_bindings.app_uuid,
  inserted.user_id,
  CASE
    WHEN allowed_bindings.scope_type = public.rbac_scope_app() THEN 'Default API key RBAC app binding'
    ELSE 'Default API key RBAC org binding'
  END,
  true
FROM inserted
JOIN allowed_bindings ON allowed_bindings.name = inserted.name
ON CONFLICT DO NOTHING`
