-- App-scoped preview deployments need to create dynamic channels, so a
-- channel-scoped role cannot be assigned ahead of time. This role is therefore
-- intentionally scoped to one app. It does not restrict access by channel name;
-- enforcing a PR-name or creator boundary needs a separate data model.
INSERT INTO public.roles (name, scope_type, description, priority_rank, is_assignable, created_by)
VALUES (
  'app_preview',
  public.rbac_scope_app(),
  'Preview deployment lifecycle for an app: upload and promote bundles, create channels, and delete channels',
  69,
  true,
  NULL
)
ON CONFLICT (name) DO UPDATE
SET
  scope_type = EXCLUDED.scope_type,
  description = EXCLUDED.description,
  priority_rank = EXCLUDED.priority_rank,
  is_assignable = EXCLUDED.is_assignable;

-- Keep this role limited to the preview deployment lifecycle. In particular it
-- intentionally excludes bundle deletion, app settings, device control, role
-- management, channel settings, rollbacks, and forced-device management.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
INNER JOIN public.permissions
  ON permissions.key IN (
    public.rbac_perm_app_read(),
    public.rbac_perm_app_read_bundles(),
    public.rbac_perm_app_upload_bundle(),
    public.rbac_perm_app_create_channel(),
    public.rbac_perm_channel_read(),
    public.rbac_perm_channel_promote_bundle(),
    public.rbac_perm_channel_delete()
  )
WHERE roles.name = 'app_preview'
ON CONFLICT DO NOTHING;

-- App-scoped keys no longer need the automatic organization reader for CLI
-- warnings: the warning helper falls back to app.read. Remove only the rows
-- created by that compatibility path, preserving historical migrated keys.
DELETE FROM public.role_bindings AS org_reader
USING public.roles AS org_reader_role
WHERE org_reader.role_id = org_reader_role.id
  AND org_reader.principal_type = public.rbac_principal_apikey()
  AND org_reader.scope_type = public.rbac_scope_org()
  AND org_reader_role.name = public.rbac_role_apikey_org_reader()
  AND org_reader.reason = 'API key app-scope org read compatibility';
