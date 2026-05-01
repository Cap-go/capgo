-- Fix: Allow org_admin to manage user roles in legacy fallback path
--
-- Previously org.update_user_roles mapped to super_admin in the legacy
-- permission resolver, meaning only super_admins could delete/manage
-- org members. This was inconsistent with the RBAC system where
-- org_admin explicitly has org.update_user_roles granted.
--
-- Change: org.update_user_roles -> admin (was super_admin)
-- The priority_rank guard in the application layer still prevents
-- org_admin (rank 90) from deleting org_super_admin (rank 95) bindings.

CREATE OR REPLACE FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Map permissions to their legacy equivalents
  -- This mapping should match PERMISSION_TO_LEGACY_RIGHT in utils/rbac.ts
  CASE p_permission_key
    -- Read permissions -> public.rbac_right_read()
    WHEN public.rbac_perm_org_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_org_read_members() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_bundles() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_channels() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_logs() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_app_read_devices() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read_history() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_perm_channel_read_forced_devices() THEN RETURN public.rbac_right_read();

    -- Upload permissions -> public.rbac_right_upload()
    WHEN public.rbac_perm_app_upload_bundle() THEN RETURN public.rbac_right_upload();

    -- Write permissions -> public.rbac_right_write()
    WHEN public.rbac_perm_app_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_create_channel() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_manage_devices() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_build_native() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_promote_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_rollback_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_manage_forced_devices() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_org_create_app() THEN RETURN public.rbac_right_write();

    -- Admin permissions -> public.rbac_right_admin()
    WHEN public.rbac_perm_org_update_settings() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_invite_user() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_billing() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_invoices() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_bundle_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_update_user_roles() THEN RETURN public.rbac_right_admin();

    -- Super admin permissions -> public.rbac_right_super_admin()
    WHEN public.rbac_perm_org_update_billing() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_org_read_billing_audit() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_org_delete() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_app_transfer() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_impersonate_user() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_orgs_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_apps_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_manage_channels_any() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_run_maintenance_jobs() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_delete_orphan_users() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_read_all_audit() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_perm_platform_db_break_glass() THEN RETURN public.rbac_right_super_admin();

    ELSE RETURN NULL; -- Unknown permission
  END CASE;
END;
$$;

ALTER FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") TO "anon";
