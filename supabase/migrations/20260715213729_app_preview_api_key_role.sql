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

-- Keep the API-key listing RPC signed-in only. Reassert explicit grants so the
-- function cannot regain anonymous execution through default ACLs.
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_apikeys(uuid) TO authenticated,
service_role;

-- These helpers are public RPC entry points: anonymous callers authenticate
-- through the request API-key header, while each function performs its own RBAC
-- authorization before returning data.
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM public;
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey_v2(
    text, text
) FROM public;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.check_org_members_password_policy(
    uuid
) FROM public;
REVOKE ALL ON FUNCTION public.check_org_members_password_policy(uuid) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(
    uuid
) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) FROM public;
REVOKE ALL ON FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) TO anon,
authenticated,
service_role;

REVOKE ALL ON FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) FROM public;
REVOKE ALL ON FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) FROM anon,
authenticated,
service_role;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) TO anon,
authenticated,
service_role;

-- Default privileges can grant EXECUTE directly to anon/authenticated after a
-- function-level PUBLIC revoke. Reassert the service-only ACLs explicitly.
DO $$
DECLARE
  function_signature pg_catalog.regprocedure;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.apikey_has_current_org_create_capability(uuid)'::pg_catalog.regprocedure,
    'public.apikey_has_global_permission(text, text)'::pg_catalog.regprocedure,
    'public.apikeys_force_server_key()'::pg_catalog.regprocedure,
    'public.apikeys_strip_plain_key_for_hashed()'::pg_catalog.regprocedure,
    'public.assert_effective_super_admin_binding_removal(uuid, text)'::pg_catalog.regprocedure,
    'public.prevent_role_binding_priority_escalation()'::pg_catalog.regprocedure,
    'public.check_encrypted_bundle_on_insert()'::pg_catalog.regprocedure,
    'public.check_org_hashed_key_enforcement(uuid, public.apikeys)'::pg_catalog.regprocedure,
    'public.cleanup_onboarding_app_data_on_complete()'::pg_catalog.regprocedure,
    'public.delete_old_deleted_versions()'::pg_catalog.regprocedure,
    'public.enqueue_credit_usage_posthog_event()'::pg_catalog.regprocedure,
    'public.generate_org_user_stripe_info_on_org_create()'::pg_catalog.regprocedure,
    'public.get_apikey()'::pg_catalog.regprocedure,
    'public.get_org_members(uuid, uuid)'::pg_catalog.regprocedure,
    'public.noupdate()'::pg_catalog.regprocedure,
    'public.prevent_last_super_admin_binding_delete()'::pg_catalog.regprocedure,
    'public.prevent_last_super_admin_binding_update()'::pg_catalog.regprocedure,
    'public.process_all_cron_tasks()'::pg_catalog.regprocedure,
    'public.process_queue_with_healthcheck(text[], integer, text)'::pg_catalog.regprocedure,
    'public.reassign_webhook_created_by_before_user_delete()'::pg_catalog.regprocedure,
    'public.sanitize_apps_text_fields()'::pg_catalog.regprocedure,
    'public.sanitize_orgs_text_fields()'::pg_catalog.regprocedure,
    'public.sanitize_tmp_users_text_fields()'::pg_catalog.regprocedure,
    'public.sanitize_users_text_fields()'::pg_catalog.regprocedure,
    'public.set_webhook_created_by()'::pg_catalog.regprocedure,
    'public.sync_org_has_usage_credits_from_grants()'::pg_catalog.regprocedure
  ]
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', function_signature);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
  END LOOP;
END;
$$;

-- The squashed baseline is already applied in existing environments, so ensure
-- its scheduler registration is restored with a forward-only migration.
SELECT
    cron.schedule(
        'process_all_cron_tasks',
        '10 seconds',
        $job$SELECT public.process_all_cron_tasks();$job$
    )
WHERE NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'process_all_cron_tasks'
);
