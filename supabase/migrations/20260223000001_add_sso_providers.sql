-- Migration: Add SSO providers table and org.manage_sso RBAC permission
-- Purpose: Enterprise SSO support (SAML 2.0) with DNS domain verification

-- =============================================================================
-- 1) RBAC permission function for org.manage_sso
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rbac_perm_org_manage_sso() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.manage_sso'::text $$;

-- =============================================================================
-- 2) Register the permission in the permissions table
-- =============================================================================
INSERT INTO public.permissions (key, scope_type, description)
VALUES
  (public.rbac_perm_org_manage_sso(), public.rbac_scope_org(), 'Manage SSO providers for an organization')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 3) Attach permission to org_admin, org_super_admin, and platform_super_admin
-- =============================================================================

-- platform_super_admin gets all permissions (already has wildcard, but explicit is safe)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = public.rbac_perm_org_manage_sso()
WHERE r.name = public.rbac_role_platform_super_admin()
ON CONFLICT DO NOTHING;

-- org_super_admin: SSO management is a privileged org operation
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = public.rbac_perm_org_manage_sso()
WHERE r.name = public.rbac_role_org_super_admin()
ON CONFLICT DO NOTHING;

-- org_admin: SSO management for org admins
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = public.rbac_perm_org_manage_sso()
WHERE r.name = public.rbac_role_org_admin()
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4) Update rbac_legacy_right_for_permission to map org.manage_sso -> admin
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."rbac_legacy_right_for_permission"("p_permission_key" "text") RETURNS "public"."user_min_right"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
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

    -- Admin permissions -> public.rbac_right_admin()
    WHEN public.rbac_perm_org_update_settings() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_invite_user() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_billing() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_invoices() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_org_manage_sso() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_app_read_audit() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_bundle_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_delete() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_perm_channel_read_audit() THEN RETURN public.rbac_right_admin();

    -- Super admin permissions -> public.rbac_right_super_admin()
    WHEN public.rbac_perm_org_update_user_roles() THEN RETURN public.rbac_right_super_admin();
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

-- =============================================================================
-- 5) Create sso_providers table
-- =============================================================================
CREATE TABLE public.sso_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    domain text NOT NULL UNIQUE,
    provider_id text,
    status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'active', 'disabled')),
    enforce_sso boolean NOT NULL DEFAULT false,
    dns_verification_token text NOT NULL,
    dns_verified_at timestamptz,
    metadata_url text,
    attribute_mapping jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index on domain for fast lookups
CREATE INDEX idx_sso_providers_domain ON public.sso_providers (domain);

-- Index on org_id for org-scoped queries
CREATE INDEX idx_sso_providers_org_id ON public.sso_providers (org_id);

-- =============================================================================
-- 6) Trigger function for updated_at (with SET search_path = '')
-- =============================================================================
CREATE OR REPLACE FUNCTION "public"."update_sso_providers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER "handle_sso_providers_updated_at"
    BEFORE UPDATE ON "public"."sso_providers"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_sso_providers_updated_at"();

-- =============================================================================
-- 7) Enable RLS
-- =============================================================================
ALTER TABLE "public"."sso_providers" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 8) RLS policies using get_identity_org_allowed (sso_providers has NO app_id)
--    One policy per operation. Both authenticated and anon roles.
-- =============================================================================

-- SELECT: org admins can read SSO providers
CREATE POLICY "Allow org admins to select sso_providers"
    ON "public"."sso_providers"
    FOR SELECT
    TO "anon", "authenticated"
    USING (
        "public"."check_min_rights"(
            'admin'::"public"."user_min_right",
            "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"),
            "org_id",
            NULL::character varying,
            NULL::bigint
        )
    );

-- INSERT: org admins can create SSO providers
CREATE POLICY "Allow org admins to insert sso_providers"
    ON "public"."sso_providers"
    FOR INSERT
    TO "anon", "authenticated"
    WITH CHECK (
        "public"."check_min_rights"(
            'admin'::"public"."user_min_right",
            "public"."get_identity_org_allowed"('{write,all}'::"public"."key_mode"[], "org_id"),
            "org_id",
            NULL::character varying,
            NULL::bigint
        )
    );

-- UPDATE: org admins can update SSO providers
CREATE POLICY "Allow org admins to update sso_providers"
    ON "public"."sso_providers"
    FOR UPDATE
    TO "anon", "authenticated"
    USING (
        "public"."check_min_rights"(
            'admin'::"public"."user_min_right",
            "public"."get_identity_org_allowed"('{write,all}'::"public"."key_mode"[], "org_id"),
            "org_id",
            NULL::character varying,
            NULL::bigint
        )
    )
    WITH CHECK (
        "public"."check_min_rights"(
            'admin'::"public"."user_min_right",
            "public"."get_identity_org_allowed"('{write,all}'::"public"."key_mode"[], "org_id"),
            "org_id",
            NULL::character varying,
            NULL::bigint
        )
    );

-- DELETE: org super_admins can delete SSO providers
CREATE POLICY "Allow org super_admins to delete sso_providers"
    ON "public"."sso_providers"
    FOR DELETE
    TO "anon", "authenticated"
    USING (
        "public"."check_min_rights"(
            'super_admin'::"public"."user_min_right",
            "public"."get_identity_org_allowed"('{all}'::"public"."key_mode"[], "org_id"),
            "org_id",
            NULL::character varying,
            NULL::bigint
        )
    );

-- =============================================================================
-- 9) Grant table permissions to roles
-- =============================================================================
GRANT ALL ON TABLE "public"."sso_providers" TO "anon";
GRANT ALL ON TABLE "public"."sso_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."sso_providers" TO "service_role";

-- Grant function permissions
GRANT ALL ON FUNCTION "public"."rbac_perm_org_manage_sso"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_manage_sso"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_manage_sso"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "service_role";
