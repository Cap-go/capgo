CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_owner_org_app_id
ON public.apps (owner_org, app_id);

INSERT INTO public.permissions (key, scope_type, description)
VALUES (
  'app.manage_notifications',
  public.rbac_scope_app(),
  'Manage notification campaigns, badge updates, recipient lookup, and delivery stats for an app'
)
ON CONFLICT (key) DO UPDATE
SET scope_type = EXCLUDED.scope_type,
    description = EXCLUDED.description;

INSERT INTO public.roles (name, scope_type, description, priority_rank, is_assignable, created_by)
VALUES (
  'app_notifications',
  public.rbac_scope_app(),
  'Send and inspect notifications for an app without device or update settings access',
  64,
  true,
  NULL
)
ON CONFLICT (name) DO UPDATE
SET scope_type = EXCLUDED.scope_type,
    description = EXCLUDED.description,
    priority_rank = EXCLUDED.priority_rank,
    is_assignable = EXCLUDED.is_assignable;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key = 'app.manage_notifications'
WHERE r.name IN (
  public.rbac_role_platform_super_admin(),
  public.rbac_role_org_super_admin(),
  public.rbac_role_org_admin(),
  public.rbac_role_app_admin(),
  public.rbac_role_app_developer(),
  'app_notifications'
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
    WHEN 'app.manage_notifications' THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_manage_devices() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_app_build_native() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_update_settings() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_promote_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_rollback_bundle() THEN RETURN public.rbac_right_write();
    WHEN public.rbac_perm_channel_manage_forced_devices() THEN RETURN public.rbac_right_write();

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

COMMENT ON FUNCTION public.rbac_legacy_right_for_permission(text) IS
  'Maps RBAC permission keys to legacy user_min_right values for fallback checks.';

ALTER FUNCTION public.rbac_legacy_right_for_permission(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.rbac_legacy_right_for_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_legacy_right_for_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_permission(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.notification_provider_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  provider text NOT NULL,
  status text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  secret_ref text,
  created_by uuid,
  CONSTRAINT notification_provider_configs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_provider_configs_app_provider_key UNIQUE (app_id, provider),
  CONSTRAINT notification_provider_configs_provider_check CHECK (provider IN ('fcm', 'apns')),
  CONSTRAINT notification_provider_configs_status_check CHECK (status IN ('draft', 'configured', 'disabled', 'error')),
  CONSTRAINT notification_provider_configs_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_provider_configs_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_provider_configs_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_provider_configs_app
ON public.notification_provider_configs (app_id);

CREATE INDEX IF NOT EXISTS idx_notification_provider_configs_owner_org
ON public.notification_provider_configs (owner_org);

CREATE TABLE IF NOT EXISTS public.notification_app_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  push_update_enabled boolean DEFAULT false NOT NULL,
  push_update_install_mode text DEFAULT 'next'::text NOT NULL,
  push_update_channel text,
  created_by uuid,
  CONSTRAINT notification_app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT notification_app_settings_app_key UNIQUE (app_id),
  CONSTRAINT notification_app_settings_install_mode_check CHECK (push_update_install_mode IN ('next', 'set')),
  CONSTRAINT notification_app_settings_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_app_settings_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_app_settings_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_app_settings_owner_org
ON public.notification_app_settings (owner_org);

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_org uuid NOT NULL,
  app_id character varying(50) NOT NULL,
  name text NOT NULL,
  kind text DEFAULT 'alert'::text NOT NULL,
  status text NOT NULL,
  audience jsonb DEFAULT '{}'::jsonb NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  scheduled_at timestamp with time zone,
  queued_at timestamp with time zone,
  completed_at timestamp with time zone,
  counters jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  CONSTRAINT notification_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT notification_campaigns_kind_check CHECK (kind IN ('alert', 'background', 'badge', 'update_check')),
  CONSTRAINT notification_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'paused', 'failed', 'cancelled')),
  CONSTRAINT notification_campaigns_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE,
  CONSTRAINT notification_campaigns_owner_org_app_id_fkey FOREIGN KEY (owner_org, app_id) REFERENCES public.apps(owner_org, app_id) ON DELETE CASCADE,
  CONSTRAINT notification_campaigns_owner_org_fkey FOREIGN KEY (owner_org) REFERENCES public.orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_app_created
ON public.notification_campaigns (app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_owner_org
ON public.notification_campaigns (owner_org);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status_scheduled
ON public.notification_campaigns (status, scheduled_at)
WHERE status IN ('scheduled', 'queued');

ALTER TABLE public.notification_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all notification provider config access"
ON public.notification_provider_configs
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all notification app settings access"
ON public.notification_app_settings
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all notification campaign access"
ON public.notification_campaigns
AS RESTRICTIVE
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.notification_provider_configs FROM PUBLIC;
REVOKE ALL ON public.notification_provider_configs FROM anon;
REVOKE ALL ON public.notification_provider_configs FROM authenticated;
GRANT ALL ON public.notification_provider_configs TO service_role;

REVOKE ALL ON public.notification_app_settings FROM PUBLIC;
REVOKE ALL ON public.notification_app_settings FROM anon;
REVOKE ALL ON public.notification_app_settings FROM authenticated;
GRANT ALL ON public.notification_app_settings TO service_role;

REVOKE ALL ON public.notification_campaigns FROM PUBLIC;
REVOKE ALL ON public.notification_campaigns FROM anon;
REVOKE ALL ON public.notification_campaigns FROM authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;

COMMENT ON TABLE public.notification_provider_configs IS 'Low-cardinality native notification provider configuration. Per-device push tokens are stored only as encrypted Cloudflare Analytics Engine events, not in Postgres.';
COMMENT ON TABLE public.notification_campaigns IS 'Low-cardinality native notification campaign control plane. Fanout state and delivery receipts are stored in Cloudflare Queues/Analytics Engine, not per-device Postgres rows.';
COMMENT ON TABLE public.notification_app_settings IS 'Low-cardinality native notification app settings, including whether Capgo can send silent push update checks. Device state remains in Cloudflare Analytics Engine.';
