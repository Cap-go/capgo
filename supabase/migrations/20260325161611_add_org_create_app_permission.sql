CREATE OR REPLACE FUNCTION public.rbac_perm_org_create_app() RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 'org.create_app'::text $$;

ALTER FUNCTION public.rbac_perm_org_create_app() OWNER TO postgres;

COMMENT ON FUNCTION public.rbac_perm_org_create_app() IS
  'RBAC permission key: create an app within an organization.';

REVOKE ALL ON FUNCTION public.rbac_perm_org_create_app() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_perm_org_create_app() TO anon;
GRANT EXECUTE ON FUNCTION public.rbac_perm_org_create_app() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_perm_org_create_app() TO service_role;

INSERT INTO public.permissions (key, scope_type, description)
VALUES (
  public.rbac_perm_org_create_app(),
  public.rbac_scope_org(),
  'Create a new app within an organization'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = public.rbac_perm_org_create_app()
WHERE r.name IN (
  public.rbac_role_org_super_admin(),
  public.rbac_role_org_admin(),
  public.rbac_role_org_billing_admin(),
  public.rbac_role_org_member()
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rbac_legacy_right_for_permission(
  p_permission_key text
) RETURNS public.user_min_right
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
BEGIN
  CASE p_permission_key
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

    WHEN public.rbac_perm_app_upload_bundle() THEN RETURN public.rbac_right_upload();

    WHEN public.rbac_perm_app_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_create_channel() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_manage_devices() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_build_native() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_promote_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_rollback_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_manage_forced_devices() THEN RETURN public.rbac_right_write();

    WHEN public.rbac_perm_org_create_app() THEN RETURN public.rbac_right_admin();
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
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_check_permission_request(
  p_permission_key text,
  p_org_id uuid DEFAULT NULL,
  p_app_id character varying DEFAULT NULL,
  p_channel_id bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    public.get_apikey_header()
  );
END;
$$;

ALTER FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) OWNER TO postgres;

COMMENT ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) IS
  'Request-aware RBAC permission wrapper for RLS and SQL callers. Uses auth.uid() and capgkey header, preserving RBAC/legacy fallback semantics.';

REVOKE ALL ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_request(text, uuid, character varying, bigint) TO service_role;

DROP POLICY IF EXISTS "Allow insert for apikey (write,all) (admin+)" ON public.apps;

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON public.apps
FOR INSERT TO anon, authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_create_app(),
    owner_org,
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in images" ON storage.objects;

CREATE POLICY "Allow user or apikey to insert they own folder in images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[1] = 'org' THEN
        (
          EXISTS (
            SELECT 1
            FROM public.apps
            WHERE owner_org = ((storage.foldername(name))[2])::uuid
              AND app_id = (storage.foldername(name))[3]
          )
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_update_settings(),
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3],
            NULL::bigint
          )
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.apps
            WHERE owner_org = ((storage.foldername(name))[2])::uuid
              AND app_id = (storage.foldername(name))[3]
          )
          AND public.rbac_check_permission_request(
            public.rbac_perm_org_create_app(),
            ((storage.foldername(name))[2])::uuid,
            NULL::character varying,
            NULL::bigint
          )
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[1]
    )
  )
);
