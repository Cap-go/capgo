-- The squashed baseline retained a dead pre-RBAC trigger function. The current
-- schema has no trigger or other dependency on it, and its body references
-- columns and types that no longer exist.
DROP FUNCTION IF EXISTS public.generate_org_user_on_org_create();
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
