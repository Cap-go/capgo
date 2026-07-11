-- Harden privileges after the prod schema baseline.
-- The schema-only dump preserves production grant state, which is looser than
-- the migration-era expectations covered by pgTAP / Vitest hardening suites.

-- global_stats must not be readable via PostgREST publishable keys
REVOKE ALL PRIVILEGES ON TABLE public.global_stats FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.global_stats FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.global_stats FROM authenticated;
GRANT ALL ON TABLE public.global_stats TO service_role;

-- webhook rows are API-mediated only
REVOKE ALL PRIVILEGES ON TABLE public.webhooks FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.webhooks FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.webhooks FROM authenticated;
GRANT ALL ON TABLE public.webhooks TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.webhook_deliveries FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_deliveries FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_deliveries FROM authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;

-- Drop leftover/renamed policies that the pending RLS rewrite recreates under
-- canonical names.
DROP POLICY IF EXISTS "Allow read for auth (read+)" ON public.channel_devices;
DROP POLICY IF EXISTS "Allow org admins to select sso_providers" ON public.sso_providers;

DO $$
DECLARE
  service_only text[] := ARRAY[
    'public.apikey_has_current_org_create_capability(uuid)',
    'public.apikey_has_global_permission(text, text)',
    'public.apikeys_force_server_key()',
    'public.apikeys_strip_plain_key_for_hashed()',
    'public.check_encrypted_bundle_on_insert()',
    'public.check_org_hashed_key_enforcement(uuid, public.apikeys)',
    'public.cleanup_onboarding_app_data_on_complete()',
    'public.cleanup_old_audit_logs()',
    'public.cleanup_frequent_job_details()',
    'public.delete_http_response(bigint)',
    'public.delete_old_deleted_apps()',
    'public.delete_old_deleted_versions()',
    'public.enqueue_credit_usage_posthog_event()',
    'public.generate_org_user_stripe_info_on_org_create()',
    'public.get_apikey()',
    'public.get_org_perm_for_apikey_v2(text, text)',
    'public.get_orgs_v7(uuid)',
    'public.get_total_metrics(uuid, date, date)',
    'public.has_2fa_enabled(uuid)',
    'public.noupdate()',
    'public.prevent_last_super_admin_binding_delete()',
    'public.prevent_last_super_admin_binding_update()',
    'public.process_all_cron_tasks()',
    'public.process_queue_with_healthcheck(text[], integer, text)',
    'public.rbac_enable_for_org(uuid, uuid)',
    'public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint)',
    'public.rbac_migrate_org_users_to_bindings(uuid, uuid)',
    'public.rbac_rollback_org(uuid)',
    'public.reassign_webhook_created_by_before_user_delete()',
    'public.reject_access_due_to_2fa(uuid, uuid)',
    'public.remove_old_jobs()',
    'public.reset_onboarding_demo_app_data(uuid)',
    'public.resync_org_user_role_bindings(uuid, uuid)',
    'public.sanitize_apps_text_fields()',
    'public.sanitize_orgs_text_fields()',
    'public.sanitize_tmp_users_text_fields()',
    'public.sanitize_users_text_fields()',
    'public.set_webhook_created_by()',
    'public.sync_org_has_usage_credits_from_grants()',
    'public.sync_org_user_role_binding_on_delete()',
    'public.sync_org_user_role_binding_on_update()',
    'public.sync_org_user_to_role_binding()',
    'public.track_onboarding_demo_data(text, uuid, text, text[], uuid)',
    'public.claim_legacy_onboarding_demo_data(uuid)'
  ];
  auth_only text[] := ARRAY[
    'public.accept_invitation_to_org(uuid)',
    'public.acknowledge_compatibility_event(bigint, text)',
    'public.check_org_members_2fa_enabled(uuid)',
    'public.check_org_members_password_policy(uuid)',
    'public.count_non_compliant_bundles(uuid, text)',
    'public.delete_group_with_bindings(uuid)',
    'public.delete_non_compliant_bundles(uuid, text)',
    'public.delete_org_member_role(uuid, uuid)',
    'public.delete_user()',
    'public.get_account_removal_date()',
    'public.get_app_access_rbac(uuid)',
    'public.get_app_metrics(uuid)',
    'public.get_current_plan_max_org(uuid)',
    'public.get_org_members(uuid)',
    'public.get_org_members_rbac(uuid)',
    'public.get_org_user_access_rbac(uuid, uuid)',
    'public.get_user_main_org_id(uuid)',
    'public.is_account_disabled(uuid)',
    'public.is_paying_and_good_plan_org_action(uuid, public.action_type[])',
    'public.modify_permissions_tmp(text, uuid, public.user_min_right)',
    'public.rbac_check_permission(text, uuid, character varying, bigint)',
    'public.rbac_check_permission_no_password_policy(text, uuid, character varying, bigint)',
    'public.rescind_invitation(text, uuid)',
    'public.restore_deleted_account()',
    'public.update_org_invite_role_rbac(uuid, uuid, text)',
    'public.update_org_member_role(uuid, uuid, text)',
    'public.update_tmp_invite_role_rbac(uuid, text, text)'
  ];
  proc text;
  proc_oid regprocedure;
BEGIN
  FOREACH proc IN ARRAY service_only LOOP
    proc_oid := to_regprocedure(proc);
    IF proc_oid IS NULL THEN
      RAISE NOTICE 'skip missing service-only proc %', proc;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', proc_oid);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', proc_oid);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', proc_oid);
    EXECUTE format('GRANT ALL ON FUNCTION %s TO service_role', proc_oid);
  END LOOP;

  FOREACH proc IN ARRAY auth_only LOOP
    proc_oid := to_regprocedure(proc);
    IF proc_oid IS NULL THEN
      RAISE NOTICE 'skip missing auth-only proc %', proc;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', proc_oid);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', proc_oid);
    EXECUTE format('GRANT ALL ON FUNCTION %s TO authenticated', proc_oid);
    EXECUTE format('GRANT ALL ON FUNCTION %s TO service_role', proc_oid);
  END LOOP;
END;
$$;
