-- Pure helpers do not need elevated privileges.
ALTER FUNCTION public.get_apikey_header() SECURITY INVOKER;
ALTER FUNCTION public.is_apikey_expired(
    timestamp with time zone
) SECURITY INVOKER;
ALTER FUNCTION public.strip_html(text) SECURITY INVOKER;
ALTER FUNCTION public.transform_role_to_invite(
    public.user_min_right
) SECURITY INVOKER;
ALTER FUNCTION public.transform_role_to_non_invite(
    public.user_min_right
) SECURITY INVOKER;
ALTER FUNCTION public.verify_api_key_hash(text, text) SECURITY INVOKER;

-- Trigger-only internals should never be exposed as RPC entrypoints.
REVOKE ALL ON FUNCTION public.apikeys_force_server_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apikeys_strip_plain_key_for_hashed() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_encrypted_bundle_on_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_encrypted_bundle_on_insert() FROM ANON;
REVOKE ALL
ON FUNCTION public.check_encrypted_bundle_on_insert()
FROM AUTHENTICATED;

REVOKE ALL
ON FUNCTION public.cleanup_onboarding_app_data_on_complete()
FROM PUBLIC;

DO $$
BEGIN
    IF to_regprocedure('public.generate_org_user_on_org_create()') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.generate_org_user_on_org_create() FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON FUNCTION public.generate_org_user_on_org_create() FROM ANON';
        EXECUTE 'REVOKE ALL ON FUNCTION public.generate_org_user_on_org_create() FROM AUTHENTICATED';
    END IF;
END;
$$;

REVOKE ALL
ON FUNCTION public.generate_org_user_stripe_info_on_org_create()
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.generate_org_user_stripe_info_on_org_create()
FROM ANON;
REVOKE ALL
ON FUNCTION public.generate_org_user_stripe_info_on_org_create()
FROM AUTHENTICATED;

REVOKE ALL ON FUNCTION public.noupdate() FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.prevent_last_super_admin_binding_delete()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sanitize_apps_text_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_apps_text_fields() FROM ANON;
REVOKE ALL ON FUNCTION public.sanitize_apps_text_fields() FROM AUTHENTICATED;

REVOKE ALL ON FUNCTION public.sanitize_orgs_text_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_orgs_text_fields() FROM ANON;
REVOKE ALL ON FUNCTION public.sanitize_orgs_text_fields() FROM AUTHENTICATED;

REVOKE ALL ON FUNCTION public.sanitize_tmp_users_text_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_tmp_users_text_fields() FROM ANON;
REVOKE ALL
ON FUNCTION public.sanitize_tmp_users_text_fields()
FROM AUTHENTICATED;

REVOKE ALL ON FUNCTION public.sanitize_users_text_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_users_text_fields() FROM ANON;
REVOKE ALL ON FUNCTION public.sanitize_users_text_fields() FROM AUTHENTICATED;

REVOKE ALL
ON FUNCTION public.sync_org_has_usage_credits_from_grants()
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.sync_org_user_role_binding_on_delete()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.sync_org_user_role_binding_on_update()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_org_user_role_binding_on_update() FROM ANON;
REVOKE ALL
ON FUNCTION public.sync_org_user_role_binding_on_update()
FROM AUTHENTICATED;

REVOKE ALL ON FUNCTION public.sync_org_user_to_role_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_org_user_to_role_binding() FROM ANON;
REVOKE ALL
ON FUNCTION public.sync_org_user_to_role_binding()
FROM AUTHENTICATED;

-- Internal helpers and maintenance functions should stay service-role only.
REVOKE ALL
ON FUNCTION public.check_org_hashed_key_enforcement(uuid, public.apikeys)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.check_org_hashed_key_enforcement(uuid, public.apikeys)
FROM ANON;
REVOKE ALL
ON FUNCTION public.check_org_hashed_key_enforcement(uuid, public.apikeys)
FROM AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.check_org_hashed_key_enforcement(uuid, public.apikeys)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.delete_old_deleted_versions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_old_deleted_versions() FROM ANON;
REVOKE ALL
ON FUNCTION public.delete_old_deleted_versions()
FROM AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.delete_old_deleted_versions() TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_apikey() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_apikey() FROM ANON;
REVOKE ALL ON FUNCTION public.get_apikey() FROM AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_apikey() TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.get_user_main_org_id_by_app_id(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_main_org_id_by_app_id(text) TO ANON;
GRANT EXECUTE
ON FUNCTION public.get_user_main_org_id_by_app_id(text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_user_main_org_id_by_app_id(text)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying)
TO ANON;
GRANT EXECUTE
ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.reject_access_due_to_2fa_for_app(character varying)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.reject_access_due_to_2fa_for_org(
    uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.reject_access_due_to_2fa_for_org(uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.resync_org_user_role_bindings(uuid, uuid)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.resync_org_user_role_bindings(uuid, uuid)
FROM ANON;
REVOKE ALL
ON FUNCTION public.resync_org_user_role_bindings(uuid, uuid)
FROM AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.resync_org_user_role_bindings(uuid, uuid)
TO SERVICE_ROLE;

-- These RPCs are intended for signed-in users only.
REVOKE ALL ON FUNCTION public.accept_invitation_to_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation_to_org(uuid) FROM ANON;
GRANT EXECUTE ON FUNCTION public.accept_invitation_to_org(
    uuid
) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.accept_invitation_to_org(uuid) TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.check_org_members_2fa_enabled(uuid)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.check_org_members_2fa_enabled(uuid)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.check_org_members_2fa_enabled(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.check_org_members_2fa_enabled(uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.check_org_members_password_policy(uuid)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.check_org_members_password_policy(uuid)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.check_org_members_password_policy(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.check_org_members_password_policy(uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.count_non_compliant_bundles(uuid, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.count_non_compliant_bundles(uuid, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.count_non_compliant_bundles(uuid, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.count_non_compliant_bundles(uuid, text)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.delete_group_with_bindings(uuid)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.delete_group_with_bindings(uuid)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.delete_group_with_bindings(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.delete_group_with_bindings(uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.delete_non_compliant_bundles(uuid, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.delete_non_compliant_bundles(uuid, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.delete_non_compliant_bundles(uuid, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.delete_non_compliant_bundles(uuid, text)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.delete_org_member_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_org_member_role(uuid, uuid) FROM ANON;
GRANT EXECUTE
ON FUNCTION public.delete_org_member_role(uuid, uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.delete_org_member_role(uuid, uuid)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user() FROM ANON;
GRANT EXECUTE ON FUNCTION public.delete_user() TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.delete_user() TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_account_removal_date() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_removal_date() FROM ANON;
GRANT EXECUTE
ON FUNCTION public.get_account_removal_date()
TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_account_removal_date() TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_app_access_rbac(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_access_rbac(uuid) FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_app_access_rbac(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_app_access_rbac(uuid) TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.get_app_metrics(uuid, character varying, date, date)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.get_app_metrics(uuid, character varying, date, date)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.get_app_metrics(uuid, character varying, date, date)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_app_metrics(uuid, character varying, date, date)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, date, date) FROM ANON;
GRANT EXECUTE
ON FUNCTION public.get_app_metrics(uuid, date, date)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_app_metrics(uuid, date, date)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_app_metrics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid) FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_app_metrics(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_app_metrics(uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_org_members(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid, uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.get_org_members(uuid, uuid)
TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid, uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM ANON;
GRANT EXECUTE
ON FUNCTION public.get_org_members_rbac(uuid)
TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.get_org_user_access_rbac(uuid, uuid)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.get_org_user_access_rbac(uuid, uuid)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.get_org_user_access_rbac(uuid, uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_org_user_access_rbac(uuid, uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.get_total_app_storage_size_orgs(uuid, character varying)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.get_total_app_storage_size_orgs(uuid, character varying)
TO ANON;
GRANT EXECUTE
ON FUNCTION public.get_total_app_storage_size_orgs(uuid, character varying)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_total_app_storage_size_orgs(uuid, character varying)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_total_storage_size_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_total_storage_size_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.get_total_storage_size_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_total_storage_size_org(uuid)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM ANON;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.has_2fa_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_2fa_enabled() TO ANON;
GRANT EXECUTE ON FUNCTION public.has_2fa_enabled() TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.has_2fa_enabled() TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.invite_user_to_org(
    character varying, uuid, public.user_min_right
)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.invite_user_to_org(
    character varying, uuid, public.user_min_right
)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.invite_user_to_org(
    character varying, uuid, public.user_min_right
)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.invite_user_to_org(
    character varying, uuid, public.user_min_right
)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.invite_user_to_org_rbac(character varying, uuid, text)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_allowed_action_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_allowed_action_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_allowed_action_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.is_allowed_action_org(uuid) TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.is_allowed_action_org_action(uuid, public.action_type [])
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.is_allowed_action_org_action(uuid, public.action_type [])
TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_allowed_action_org_action(uuid, public.action_type [])
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.is_allowed_action_org_action(uuid, public.action_type [])
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_canceled_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_canceled_org(uuid) TO ANON;
GRANT EXECUTE ON FUNCTION public.is_canceled_org(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.is_canceled_org(uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_good_plan_v5_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_good_plan_v5_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_good_plan_v5_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.is_good_plan_v5_org(uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_onboarded_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_onboarded_org(uuid) TO ANON;
GRANT EXECUTE ON FUNCTION public.is_onboarded_org(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.is_onboarded_org(uuid) TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_onboarding_needed_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_onboarding_needed_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_onboarding_needed_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.is_onboarding_needed_org(uuid)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.is_org_yearly(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_yearly(uuid) TO ANON;
GRANT EXECUTE ON FUNCTION public.is_org_yearly(uuid) TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.is_org_yearly(uuid) TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.is_paying_and_good_plan_org(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_paying_and_good_plan_org(uuid) TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_paying_and_good_plan_org(uuid)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.is_paying_and_good_plan_org(uuid)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.is_paying_and_good_plan_org_action(
    uuid, public.action_type []
)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.is_paying_and_good_plan_org_action(
    uuid, public.action_type []
)
TO ANON;
GRANT EXECUTE
ON FUNCTION public.is_paying_and_good_plan_org_action(
    uuid, public.action_type []
)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.is_paying_and_good_plan_org_action(
    uuid, public.action_type []
)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.modify_permissions_tmp(text, uuid, public.user_min_right)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.modify_permissions_tmp(text, uuid, public.user_min_right)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.modify_permissions_tmp(text, uuid, public.user_min_right)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.modify_permissions_tmp(text, uuid, public.user_min_right)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.rbac_check_permission_no_password_policy(
    text, uuid, character varying, bigint
)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.rbac_check_permission_no_password_policy(
    text, uuid, character varying, bigint
)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.rbac_check_permission_no_password_policy(
    text, uuid, character varying, bigint
)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.rbac_check_permission_no_password_policy(
    text, uuid, character varying, bigint
)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.update_org_member_role(uuid, uuid, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.update_org_member_role(uuid, uuid, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.update_org_member_role(uuid, uuid, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.update_org_member_role(uuid, uuid, text)
TO SERVICE_ROLE;

REVOKE ALL
ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text)
FROM PUBLIC;
REVOKE ALL
ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text)
FROM ANON;
GRANT EXECUTE
ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text)
TO AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text)
TO SERVICE_ROLE;

REVOKE ALL ON FUNCTION public.verify_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_mfa() TO ANON;
GRANT EXECUTE ON FUNCTION public.verify_mfa() TO AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.verify_mfa() TO SERVICE_ROLE;
