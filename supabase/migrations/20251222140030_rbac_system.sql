-- supabase/migrations/20251222140030_rbac_system.sql
-- This preserves the original behavior while making the rollout atomic for new environments.

-- 0) RBAC literal constants (avoid repeated string literals across the migration)
-- START RBAC CONSTANTS
CREATE OR REPLACE FUNCTION public.rbac_scope_platform() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_scope_org() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_scope_app() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_scope_bundle() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_scope_channel() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_principal_user() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'user'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_principal_group() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'group'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_principal_apikey() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'apikey'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_right_super_admin() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'super_admin'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_admin() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'admin'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_write() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'write'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_upload() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'upload'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_read() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'read'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_invite_super_admin() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'invite_super_admin'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_invite_admin() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'invite_admin'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_invite_write() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'invite_write'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_right_invite_upload() RETURNS public.user_min_right
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'invite_upload'::public.user_min_right $$;

CREATE OR REPLACE FUNCTION public.rbac_role_platform_super_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform_super_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_org_super_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org_super_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_org_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_org_billing_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org_billing_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_org_member() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org_member'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_app_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_app_developer() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app_developer'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_app_uploader() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app_uploader'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_app_reader() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app_reader'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_bundle_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_bundle_reader() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle_reader'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_channel_admin() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel_admin'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_role_channel_reader() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel_reader'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_update_settings() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.update_settings'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_delete() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.delete'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read_members() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read_members'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_invite_user() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.invite_user'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_update_user_roles() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.update_user_roles'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read_billing() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read_billing'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_update_billing() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.update_billing'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read_invoices() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read_invoices'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read_audit() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read_audit'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_org_read_billing_audit() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'org.read_billing_audit'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_update_settings() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.update_settings'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_delete() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.delete'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read_bundles() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read_bundles'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_upload_bundle() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.upload_bundle'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_create_channel() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.create_channel'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read_channels() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read_channels'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read_logs() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read_logs'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_manage_devices() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.manage_devices'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read_devices() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read_devices'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_build_native() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.build_native'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_read_audit() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.read_audit'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_update_user_roles() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.update_user_roles'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_app_transfer() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'app.transfer'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_bundle_delete() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle.delete'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_bundle_read() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle.read'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_bundle_update() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'bundle.update'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_read() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.read'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_update_settings() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.update_settings'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_delete() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.delete'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_read_history() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.read_history'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_promote_bundle() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.promote_bundle'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_rollback_bundle() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.rollback_bundle'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_manage_forced_devices() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.manage_forced_devices'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_read_forced_devices() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.read_forced_devices'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_channel_read_audit() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'channel.read_audit'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_impersonate_user() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.impersonate_user'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_manage_orgs_any() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.manage_orgs_any'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_manage_apps_any() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.manage_apps_any'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_manage_channels_any() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.manage_channels_any'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_run_maintenance_jobs() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.run_maintenance_jobs'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_delete_orphan_users() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.delete_orphan_users'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_read_all_audit() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.read_all_audit'::text $$;

CREATE OR REPLACE FUNCTION public.rbac_perm_platform_db_break_glass() RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$ SELECT 'platform.db_break_glass'::text $$;
-- END RBAC CONSTANTS

-- 1) Feature flag and supporting identifiers
ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS use_new_rbac boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orgs.use_new_rbac IS 'Feature flag: when true, org uses RBAC instead of legacy org_users rights.';

CREATE TABLE IF NOT EXISTS public.rbac_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  use_new_rbac boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rbac_settings IS 'Singleton row to flip RBAC on globally without touching org records.';
COMMENT ON COLUMN public.rbac_settings.use_new_rbac IS 'Global RBAC flag. Legacy permissions remain default (false).';

INSERT INTO public.rbac_settings (id, use_new_rbac)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rbac_settings
ALTER COLUMN updated_at SET DEFAULT now();

-- Add stable UUIDs for polymorphic principals/scopes.
ALTER TABLE public.apikeys
ADD COLUMN IF NOT EXISTS rbac_id uuid DEFAULT gen_random_uuid();
UPDATE public.apikeys SET rbac_id = gen_random_uuid() WHERE rbac_id IS NULL;
ALTER TABLE public.apikeys ALTER COLUMN rbac_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apikeys_rbac_id_key'
      AND conrelid = 'public.apikeys'::regclass
  ) THEN
    ALTER TABLE public.apikeys ADD CONSTRAINT apikeys_rbac_id_key UNIQUE (rbac_id);
  END IF;
END;
$$;
COMMENT ON COLUMN public.apikeys.rbac_id IS 'Stable UUID to bind RBAC roles to api keys.';

ALTER TABLE public.channels
ADD COLUMN IF NOT EXISTS rbac_id uuid DEFAULT gen_random_uuid();
UPDATE public.channels SET rbac_id = gen_random_uuid() WHERE rbac_id IS NULL;
ALTER TABLE public.channels ALTER COLUMN rbac_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_rbac_id_key'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels ADD CONSTRAINT channels_rbac_id_key UNIQUE (rbac_id);
  END IF;
END;
$$;
COMMENT ON COLUMN public.channels.rbac_id IS 'Stable UUID to bind RBAC roles to channel scope.';

-- apps.id already exists but was not unique; make it an addressable scope identifier.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apps_id_unique'
      AND conrelid = 'public.apps'::regclass
  ) THEN
    ALTER TABLE public.apps
    ADD CONSTRAINT apps_id_unique UNIQUE (id);
  END IF;
END;
$$;
COMMENT ON COLUMN public.apps.id IS 'UUID scope id for RBAC (app-level roles reference this id).';

-- 2) Core RBAC tables
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN (public.rbac_scope_platform(), public.rbac_scope_org(), public.rbac_scope_app(), public.rbac_scope_bundle(), public.rbac_scope_channel())),
  description text,
  priority_rank int NOT NULL DEFAULT 0,
  is_assignable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);
COMMENT ON TABLE public.roles IS 'Canonical RBAC roles. Scope_type indicates the native scope the role is defined for.';

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN (public.rbac_scope_platform(), public.rbac_scope_org(), public.rbac_scope_app(), public.rbac_scope_bundle(), public.rbac_scope_channel())),
  bundle_id bigint NULL REFERENCES public.app_versions(id) ON DELETE CASCADE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.permissions IS 'Atomic permission keys; used by role_permissions. Only priority permissions are seeded in Phase 1.';

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
COMMENT ON TABLE public.role_permissions IS 'Join table assigning permission keys to roles.';

CREATE TABLE IF NOT EXISTS public.role_hierarchy (
  parent_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  child_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_role_id, child_role_id),
  CHECK (parent_role_id IS DISTINCT FROM child_role_id)
);
COMMENT ON TABLE public.role_hierarchy IS 'Explicit role inheritance. Parent inherits all permissions of its children (acyclic by convention).';

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_org_name_unique UNIQUE (org_id, name)
);
COMMENT ON TABLE public.groups IS 'Org-scoped groups/teams. Groups are a principal for role bindings.';

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
COMMENT ON TABLE public.group_members IS 'Membership join table linking users to groups.';

CREATE TABLE IF NOT EXISTS public.role_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_type text NOT NULL CHECK (principal_type IN (public.rbac_principal_user(), public.rbac_principal_group(), public.rbac_principal_apikey())),
  principal_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN (public.rbac_scope_platform(), public.rbac_scope_org(), public.rbac_scope_app(), public.rbac_scope_bundle(), public.rbac_scope_channel())),
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id uuid NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  bundle_id bigint NULL REFERENCES public.app_versions(id) ON DELETE CASCADE,
  channel_id uuid NULL REFERENCES public.channels(rbac_id) ON DELETE CASCADE,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  reason text NULL,
  is_direct boolean NOT NULL DEFAULT true,
  CHECK (
    (scope_type = public.rbac_scope_platform() AND org_id IS NULL AND app_id IS NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = public.rbac_scope_org() AND org_id IS NOT NULL AND app_id IS NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = public.rbac_scope_app() AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NULL AND channel_id IS NULL) OR
    (scope_type = public.rbac_scope_bundle() AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NOT NULL AND channel_id IS NULL) OR
    (scope_type = public.rbac_scope_channel() AND org_id IS NOT NULL AND app_id IS NOT NULL AND bundle_id IS NULL AND channel_id IS NOT NULL)
  )
);
COMMENT ON TABLE public.role_bindings IS 'Assign roles to principals at a scope. SSD: only one role per scope_type per scope/principal.';

-- SSD: only one role per scope_type per scope/principal.
CREATE UNIQUE INDEX IF NOT EXISTS role_bindings_platform_scope_uniq
  ON public.role_bindings (principal_type, principal_id, scope_type)
  WHERE scope_type = public.rbac_scope_platform();
CREATE UNIQUE INDEX IF NOT EXISTS role_bindings_org_scope_uniq
  ON public.role_bindings (principal_type, principal_id, org_id, scope_type)
  WHERE scope_type = public.rbac_scope_org();
CREATE UNIQUE INDEX IF NOT EXISTS role_bindings_app_scope_uniq
  ON public.role_bindings (principal_type, principal_id, app_id, scope_type)
  WHERE scope_type = public.rbac_scope_app();
CREATE UNIQUE INDEX IF NOT EXISTS role_bindings_bundle_scope_uniq
  ON public.role_bindings (principal_type, principal_id, bundle_id, scope_type)
  WHERE scope_type = public.rbac_scope_bundle();
CREATE UNIQUE INDEX IF NOT EXISTS role_bindings_channel_scope_uniq
  ON public.role_bindings (principal_type, principal_id, channel_id, scope_type)
  WHERE scope_type = public.rbac_scope_channel();

CREATE INDEX IF NOT EXISTS role_bindings_principal_scope_idx
  ON public.role_bindings (principal_type, principal_id, scope_type, org_id, app_id, channel_id);
CREATE INDEX IF NOT EXISTS role_bindings_scope_idx
  ON public.role_bindings (scope_type, org_id, app_id, channel_id);

-- SSD enforcement is now handled directly by unique indexes on scope_type

-- 3) Seed priority permissions (Phase 1 only)
INSERT INTO public.permissions (key, scope_type, description)
VALUES
  -- Org permissions
  (public.rbac_perm_org_read(), public.rbac_scope_org(), 'Read org level settings and metadata'),
  (public.rbac_perm_org_update_settings(), public.rbac_scope_org(), 'Update org configuration/settings'),
  (public.rbac_perm_org_delete(), public.rbac_scope_org(), 'Delete an organization'),
  (public.rbac_perm_org_read_members(), public.rbac_scope_org(), 'Read org membership list'),
  (public.rbac_perm_org_invite_user(), public.rbac_scope_org(), 'Invite or add members to org'),
  (public.rbac_perm_org_update_user_roles(), public.rbac_scope_org(), 'Change org/member roles'),
  (public.rbac_perm_org_read_billing(), public.rbac_scope_org(), 'Read org billing settings'),
  (public.rbac_perm_org_update_billing(), public.rbac_scope_org(), 'Update org billing settings'),
  (public.rbac_perm_org_read_invoices(), public.rbac_scope_org(), 'Read invoices'),
  (public.rbac_perm_org_read_audit(), public.rbac_scope_org(), 'Read org-level audit trail'),
  (public.rbac_perm_org_read_billing_audit(), public.rbac_scope_org(), 'Read billing/audit details'),
  -- App permissions
  (public.rbac_perm_app_read(), public.rbac_scope_app(), 'Read app metadata'),
  (public.rbac_perm_app_update_settings(), public.rbac_scope_app(), 'Update app settings'),
  (public.rbac_perm_app_delete(), public.rbac_scope_app(), 'Delete an app'),
  (public.rbac_perm_app_read_bundles(), public.rbac_scope_app(), 'Read app bundle metadata'),
  (public.rbac_perm_app_upload_bundle(), public.rbac_scope_app(), 'Upload a bundle'),
  (public.rbac_perm_app_create_channel(), public.rbac_scope_app(), 'Create channels'),
  (public.rbac_perm_app_read_channels(), public.rbac_scope_app(), 'List/read channels'),
  (public.rbac_perm_app_read_logs(), public.rbac_scope_app(), 'Read app logs/metrics'),
  (public.rbac_perm_app_manage_devices(), public.rbac_scope_app(), 'Manage devices at app scope'),
  (public.rbac_perm_app_read_devices(), public.rbac_scope_app(), 'Read devices at app scope'),
  (public.rbac_perm_app_build_native(), public.rbac_scope_app(), 'Trigger native builds'),
  (public.rbac_perm_app_read_audit(), public.rbac_scope_app(), 'Read app-level audit trail'),
  (public.rbac_perm_app_update_user_roles(), public.rbac_scope_app(), 'Update user roles for this app'),
  (public.rbac_perm_app_transfer(), public.rbac_scope_app(), 'Transfer app to another organization'),
  -- Bundle permissions
  (public.rbac_perm_bundle_delete(), public.rbac_scope_app(), 'Delete a bundle'),
  -- Channel permissions
  (public.rbac_perm_channel_read(), public.rbac_scope_channel(), 'Read channel metadata'),
  (public.rbac_perm_channel_update_settings(), public.rbac_scope_channel(), 'Update channel settings'),
  (public.rbac_perm_channel_delete(), public.rbac_scope_channel(), 'Delete a channel'),
  (public.rbac_perm_channel_read_history(), public.rbac_scope_channel(), 'Read deploy history'),
  (public.rbac_perm_channel_promote_bundle(), public.rbac_scope_channel(), 'Promote bundle to channel'),
  (public.rbac_perm_channel_rollback_bundle(), public.rbac_scope_channel(), 'Rollback bundle on channel'),
  (public.rbac_perm_channel_manage_forced_devices(), public.rbac_scope_channel(), 'Manage forced devices'),
  (public.rbac_perm_channel_read_forced_devices(), public.rbac_scope_channel(), 'Read forced devices'),
  (public.rbac_perm_channel_read_audit(), public.rbac_scope_channel(), 'Read channel-level audit'),
  -- Platform permissions
  (public.rbac_perm_platform_impersonate_user(), public.rbac_scope_platform(), 'Support/impersonation'),
  (public.rbac_perm_platform_manage_orgs_any(), public.rbac_scope_platform(), 'Administer any org'),
  (public.rbac_perm_platform_manage_apps_any(), public.rbac_scope_platform(), 'Administer any app'),
  (public.rbac_perm_platform_manage_channels_any(), public.rbac_scope_platform(), 'Administer any channel'),
  (public.rbac_perm_platform_run_maintenance_jobs(), public.rbac_scope_platform(), 'Run maintenance/ops jobs'),
  (public.rbac_perm_platform_delete_orphan_users(), public.rbac_scope_platform(), 'Delete orphan users'),
  (public.rbac_perm_platform_read_all_audit(), public.rbac_scope_platform(), 'Read all audit trails'),
  (public.rbac_perm_platform_db_break_glass(), public.rbac_scope_platform(), 'Emergency direct DB access')
ON CONFLICT (key) DO NOTHING;

-- 4) Seed priority roles
INSERT INTO public.roles (name, scope_type, description, priority_rank, is_assignable, created_by)
VALUES
  (public.rbac_role_platform_super_admin(), public.rbac_scope_platform(), 'Full platform control (not assignable to customers)', 100, false, NULL),
  (public.rbac_role_org_super_admin(), public.rbac_scope_org(), 'Super admin for an org (same permissions as org_admin)', 95, true, NULL),
  (public.rbac_role_org_admin(), public.rbac_scope_org(), 'Full org administration', 90, true, NULL),
  (public.rbac_role_org_billing_admin(), public.rbac_scope_org(), 'Billing-only administrator for an org', 80, true, NULL),
  (public.rbac_role_org_member(), public.rbac_scope_org(), 'Basic org member: read-only access to org and all apps', 75, true, NULL),
  (public.rbac_role_app_admin(), public.rbac_scope_app(), 'Full administration of an app', 70, true, NULL),
  (public.rbac_role_app_developer(), public.rbac_scope_app(), 'Developer access: upload bundles, manage devices, but no destructive operations', 68, true, NULL),
  (public.rbac_role_app_uploader(), public.rbac_scope_app(), 'Upload-only access: read app data and upload bundles', 66, true, NULL),
  (public.rbac_role_app_reader(), public.rbac_scope_app(), 'Read-only access to an app', 65, true, NULL),
  (public.rbac_role_bundle_admin(), public.rbac_scope_bundle(), 'Full administration of a bundle', 62, true, NULL),
  (public.rbac_role_bundle_reader(), public.rbac_scope_bundle(), 'Read-only access to a bundle', 61, true, NULL),
  (public.rbac_role_channel_admin(), public.rbac_scope_channel(), 'Full administration of a channel', 60, true, NULL),
  (public.rbac_role_channel_reader(), public.rbac_scope_channel(), 'Read-only access to a channel', 55, true, NULL)
ON CONFLICT (name) DO NOTHING;

-- 5) Attach permissions to roles
-- platform_super_admin: full control over all permissions (operations team only)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON TRUE
WHERE r.name = public.rbac_role_platform_super_admin()
ON CONFLICT DO NOTHING;

-- org_admin: org management, member/role management, and delegated app/channel control (no billing updates, no deletions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_org_read(), public.rbac_perm_org_update_settings(), public.rbac_perm_org_read_members(), public.rbac_perm_org_invite_user(), public.rbac_perm_org_update_user_roles(),
  public.rbac_perm_org_read_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_audit(), public.rbac_perm_org_read_billing_audit(),
  -- app/channel control granted at org scope (no deletions)
  public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
  public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(),
  public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(),
  public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_read_history(),
  public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(),
  public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_org_admin()
ON CONFLICT DO NOTHING;

-- org_super_admin: same permissions as org_admin plus app destructive operations and billing
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_org_read(), public.rbac_perm_org_update_settings(), public.rbac_perm_org_delete(), public.rbac_perm_org_read_members(), public.rbac_perm_org_invite_user(), public.rbac_perm_org_update_user_roles(),
  public.rbac_perm_org_read_billing(), public.rbac_perm_org_update_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_audit(), public.rbac_perm_org_read_billing_audit(),
  -- app/channel control granted at org scope (including deletions)
  public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_delete(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
  public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(),
  public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(),
  public.rbac_perm_app_transfer(),
  public.rbac_perm_bundle_delete(),
  public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
  public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(),
  public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_org_super_admin()
ON CONFLICT DO NOTHING;

-- org_billing_admin: restricted to billing views/updates
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_org_read(), public.rbac_perm_org_read_billing(), public.rbac_perm_org_update_billing(), public.rbac_perm_org_read_invoices(), public.rbac_perm_org_read_billing_audit()
)
WHERE r.name = public.rbac_role_org_billing_admin()
ON CONFLICT DO NOTHING;

-- org_member: basic member with read-only access to org and all apps (for self-service and visibility)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  -- Org permissions: read metadata and members (allows self-service removal)
  public.rbac_perm_org_read(), public.rbac_perm_org_read_members(),
  -- App permissions: read-only access to all apps in org
  public.rbac_perm_app_read(), 'app.list_bundles', 'app.list_channels', public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit(),
  -- Bundle permissions: read-only
  public.rbac_perm_bundle_read(),
  -- Channel permissions: read-only
  public.rbac_perm_channel_read(), public.rbac_perm_channel_read_history(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_org_member()
ON CONFLICT DO NOTHING;

-- app_admin: full control of app + channels under that app
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_app_read(), public.rbac_perm_app_update_settings(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(),
  public.rbac_perm_app_create_channel(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_manage_devices(),
  public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(), public.rbac_perm_app_update_user_roles(),
  public.rbac_perm_bundle_delete(),
  public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
  public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(),
  public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_app_admin()
ON CONFLICT DO NOTHING;

-- app_developer: can upload, manage devices, build, update channels but no deletion or creation
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(),
  public.rbac_perm_app_manage_devices(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_build_native(), public.rbac_perm_app_read_audit(),
  public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_read_history(), public.rbac_perm_channel_promote_bundle(),
  public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_app_developer()
ON CONFLICT DO NOTHING;

-- app_uploader: read access + upload bundle only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_upload_bundle(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit()
)
WHERE r.name = public.rbac_role_app_uploader()
ON CONFLICT DO NOTHING;

-- channel_admin: full control of a channel
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_channel_read(), public.rbac_perm_channel_update_settings(), public.rbac_perm_channel_delete(), public.rbac_perm_channel_read_history(),
  public.rbac_perm_channel_promote_bundle(), public.rbac_perm_channel_rollback_bundle(), public.rbac_perm_channel_manage_forced_devices(),
  public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_channel_admin()
ON CONFLICT DO NOTHING;

-- app_reader: read-only access to app
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_app_read(), public.rbac_perm_app_read_bundles(), public.rbac_perm_app_read_channels(), public.rbac_perm_app_read_logs(), public.rbac_perm_app_read_devices(), public.rbac_perm_app_read_audit()
)
WHERE r.name = public.rbac_role_app_reader()
ON CONFLICT DO NOTHING;

-- channel_reader: read-only access to channel
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_channel_read(), public.rbac_perm_channel_read_history(), public.rbac_perm_channel_read_forced_devices(), public.rbac_perm_channel_read_audit()
)
WHERE r.name = public.rbac_role_channel_reader()
ON CONFLICT DO NOTHING;

-- bundle_admin: full control of a bundle
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_bundle_read(), public.rbac_perm_bundle_update(), public.rbac_perm_bundle_delete()
)
WHERE r.name = public.rbac_role_bundle_admin()
ON CONFLICT DO NOTHING;

-- bundle_reader: read-only access to bundle
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  public.rbac_perm_bundle_read()
)
WHERE r.name = public.rbac_role_bundle_reader()
ON CONFLICT DO NOTHING;

-- 6) Role hierarchy (explicit inheritance)
-- Org hierarchy
INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_org_super_admin() AND child.name = public.rbac_role_org_admin()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_org_admin() AND child.name = public.rbac_role_app_admin()
ON CONFLICT DO NOTHING;

-- App hierarchy
INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_app_admin() AND child.name = public.rbac_role_app_developer()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_app_developer() AND child.name = public.rbac_role_app_uploader()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_app_uploader() AND child.name = public.rbac_role_app_reader()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_app_admin() AND child.name = public.rbac_role_bundle_admin()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_app_admin() AND child.name = public.rbac_role_channel_admin()
ON CONFLICT DO NOTHING;

-- Bundle hierarchy
INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_bundle_admin() AND child.name = public.rbac_role_bundle_reader()
ON CONFLICT DO NOTHING;

-- Channel hierarchy
INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = public.rbac_role_channel_admin() AND child.name = public.rbac_role_channel_reader()
ON CONFLICT DO NOTHING;

-- 7) Helper: feature flag resolution
CREATE OR REPLACE FUNCTION public.rbac_is_enabled_for_org(p_org_id uuid) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_org_enabled boolean;
  v_global_enabled boolean;
BEGIN
  SELECT use_new_rbac INTO v_org_enabled FROM public.orgs WHERE id = p_org_id;
  SELECT use_new_rbac INTO v_global_enabled FROM public.rbac_settings WHERE id = 1;

  RETURN COALESCE(v_org_enabled, false) OR COALESCE(v_global_enabled, false);
END;
$$;
COMMENT ON FUNCTION public.rbac_is_enabled_for_org(uuid) IS 'Feature-flag gate for RBAC. Defaults to false; true when org or global flag is set.';

-- 8) Helper: map legacy min_right + scope -> RBAC permission key
CREATE OR REPLACE FUNCTION public.rbac_permission_for_legacy(p_min_right public.user_min_right, p_scope text) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
BEGIN
  IF p_scope = public.rbac_scope_org() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin()) THEN
      RETURN public.rbac_perm_org_update_user_roles();
    ELSIF p_min_right IN (public.rbac_right_write(), public.rbac_right_upload(), public.rbac_right_invite_write(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_org_update_settings();
    ELSE
      RETURN public.rbac_perm_org_read();
    END IF;
  ELSIF p_scope = public.rbac_scope_app() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin(), public.rbac_right_write(), public.rbac_right_invite_write()) THEN
      RETURN public.rbac_perm_app_update_settings();
    ELSIF p_min_right IN (public.rbac_right_upload(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_app_upload_bundle();
    ELSE
      RETURN public.rbac_perm_app_read();
    END IF;
  ELSIF p_scope = public.rbac_scope_channel() THEN
    IF p_min_right IN (public.rbac_right_super_admin(), public.rbac_right_admin(), public.rbac_right_invite_super_admin(), public.rbac_right_invite_admin(), public.rbac_right_write(), public.rbac_right_invite_write()) THEN
      RETURN public.rbac_perm_channel_update_settings();
    ELSIF p_min_right IN (public.rbac_right_upload(), public.rbac_right_invite_upload()) THEN
      RETURN public.rbac_perm_channel_promote_bundle();
    ELSE
      RETURN public.rbac_perm_channel_read();
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public.rbac_permission_for_legacy(public.user_min_right, text) IS 'Compatibility mapping from legacy min_right + scope to a single RBAC permission key (documented assumptions).';

-- 9) Helper: RBAC permission resolution
CREATE OR REPLACE FUNCTION public.rbac_has_permission(
  p_principal_type text,
  p_principal_id uuid,
  p_permission_key text,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_channel_app_id text;
  v_channel_org_id uuid;
  v_has boolean := false;
BEGIN
  IF p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve scope identifiers to UUIDs
  IF p_app_id IS NOT NULL THEN
    SELECT id, owner_org INTO v_app_uuid, v_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT rbac_id, app_id, owner_org INTO v_channel_uuid, v_channel_app_id, v_channel_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_uuid IS NOT NULL THEN
      IF v_app_uuid IS NULL THEN
        SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = v_channel_app_id LIMIT 1;
      END IF;
      IF v_org_id IS NULL THEN
        v_org_id := v_channel_org_id;
      END IF;
    END IF;
  END IF;

  WITH RECURSIVE scope_catalog AS (
    SELECT public.rbac_scope_platform()::text AS scope_type, NULL::uuid AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id
    UNION ALL
    SELECT public.rbac_scope_org(), v_org_id, NULL::uuid, NULL::uuid WHERE v_org_id IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_app(), v_org_id, v_app_uuid, NULL::uuid WHERE v_app_uuid IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_channel(), v_org_id, v_app_uuid, v_channel_uuid WHERE v_channel_uuid IS NOT NULL
  ),
  direct_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.role_bindings rb ON rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_platform()) OR
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.channel_id = s.channel_id)
      )
    WHERE rb.principal_type = p_principal_type
      AND rb.principal_id = p_principal_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  group_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.group_members gm ON gm.user_id = p_principal_id
    JOIN public.groups g ON g.id = gm.group_id
    JOIN public.role_bindings rb ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = gm.group_id
    WHERE p_principal_type = public.rbac_principal_user()
      AND rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.channel_id = s.channel_id)
      )
      AND (v_org_id IS NULL OR g.org_id = v_org_id)
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  combined_roles AS (
    SELECT role_id FROM direct_roles
    UNION
    SELECT role_id FROM group_roles
  ),
  role_closure AS (
    SELECT role_id FROM combined_roles
    UNION
    SELECT rh.child_role_id
    FROM public.role_hierarchy rh
    JOIN role_closure rc ON rc.role_id = rh.parent_role_id
  ),
  perm_set AS (
    SELECT DISTINCT p.key
    FROM role_closure rc
    JOIN public.role_permissions rp ON rp.role_id = rc.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
  )
  SELECT EXISTS (SELECT 1 FROM perm_set WHERE key = p_permission_key) INTO v_has;

  RETURN v_has;
END;
$$;
COMMENT ON FUNCTION public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint) IS 'RBAC permission resolver with scope awareness and role hierarchy expansion.';

-- 10) Legacy logic extracted for fallback
CREATE OR REPLACE FUNCTION public.check_min_rights_legacy(
  min_right public.user_min_right,
  user_id uuid,
  org_id uuid,
  app_id character varying,
  channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  user_right_record RECORD;
BEGIN
  IF user_id IS NULL THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
    RETURN false;
  END IF;

  FOR user_right_record IN
    SELECT org_users.user_right, org_users.app_id, org_users.channel_id
    FROM public.org_users
    WHERE org_users.org_id = check_min_rights_legacy.org_id AND org_users.user_id = check_min_rights_legacy.user_id
  LOOP
    IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id IS NULL) OR
       (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights_legacy.app_id AND user_right_record.channel_id = check_min_rights_legacy.channel_id)
    THEN
      RETURN true;
    END IF;
  END LOOP;

  PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
  RETURN false;
END;
$$;

-- 11) Updated rights checks: route between legacy and RBAC
CREATE OR REPLACE FUNCTION public.check_min_rights(
  min_right public.user_min_right,
  org_id uuid,
  app_id character varying,
  channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := public.check_min_rights(min_right, (SELECT auth.uid()), org_id, app_id, channel_id);
  RETURN allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_min_rights(
  min_right public.user_min_right,
  user_id uuid,
  org_id uuid,
  app_id character varying,
  channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_allowed boolean := false;
  v_perm text;
  v_scope text;
  v_apikey text;
  v_apikey_principal uuid;
  v_use_rbac boolean;
  v_effective_org_id uuid := org_id;
BEGIN
  -- Derive org from app/channel when not provided to honor org-level flag and scoping.
  IF v_effective_org_id IS NULL AND app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.apps WHERE app_id = check_min_rights.app_id LIMIT 1;
  END IF;
  IF v_effective_org_id IS NULL AND channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id FROM public.channels WHERE id = channel_id LIMIT 1;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);
  IF NOT v_use_rbac THEN
    RETURN public.check_min_rights_legacy(min_right, user_id, COALESCE(org_id, v_effective_org_id), app_id, channel_id);
  END IF;

  IF channel_id IS NOT NULL THEN
    v_scope := public.rbac_scope_channel();
  ELSIF app_id IS NOT NULL THEN
    v_scope := public.rbac_scope_app();
  ELSE
    v_scope := public.rbac_scope_org();
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);

  IF user_id IS NOT NULL THEN
    v_allowed := public.rbac_has_permission(public.rbac_principal_user(), user_id, v_perm, v_effective_org_id, app_id, channel_id);
  END IF;

  -- Also consider apikey principal when RBAC is enabled (API keys can hold roles directly).
  IF NOT v_allowed THEN
    SELECT public.get_apikey_header() INTO v_apikey;
    IF v_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal FROM public.apikeys WHERE key = v_apikey LIMIT 1;
      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, v_perm, v_effective_org_id, app_id, channel_id);
      END IF;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_RBAC', jsonb_build_object('org_id', COALESCE(org_id, v_effective_org_id), 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id, 'scope', v_scope, 'perm', v_perm));
  END IF;

  RETURN v_allowed;
END;
$$;

-- 12) has_app_right helpers (branch to RBAC when enabled)
CREATE OR REPLACE FUNCTION public.has_app_right(
  "appid" character varying,
  "right" public.user_min_right
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
BEGIN
  RETURN public.has_app_right_userid("appid", "right", (SELECT auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.has_app_right_userid(
  "appid" character varying,
  "right" public.user_min_right,
  "userid" uuid
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  allowed boolean;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id("appid");

  allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_USERID', jsonb_build_object('appid', "appid", 'org_id', org_id, 'right', "right"::text, 'userid', "userid"));
  END IF;
  RETURN allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_app_right_apikey(
  "appid" character varying,
  "right" public.user_min_right,
  "userid" uuid,
  "apikey" text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  api_key record;
  allowed boolean;
  use_rbac boolean;
  perm_key text;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id("appid");
  use_rbac := public.rbac_is_enabled_for_org(org_id);

  SELECT * FROM public.apikeys WHERE key = "apikey" INTO api_key;
  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
    IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT ("appid" = ANY(api_key.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', "appid"));
      RETURN false;
    END IF;
  END IF;

  IF use_rbac THEN
    perm_key := public.rbac_permission_for_legacy("right", public.rbac_scope_app());
    allowed := public.rbac_has_permission(public.rbac_principal_apikey(), api_key.rbac_id, perm_key, org_id, "appid", NULL::bigint);
  ELSE
    allowed := public.check_min_rights("right", "userid", org_id, "appid", NULL::bigint);
  END IF;

  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', "appid", 'org_id', org_id, 'right', "right"::text, 'userid', "userid", 'rbac', use_rbac));
  END IF;
  RETURN allowed;
END;
$$;

-- 13) Compatibility helper: suggested RBAC role for a legacy org_users record
CREATE OR REPLACE FUNCTION public.rbac_legacy_role_hint(
  p_user_right public.user_min_right,
  p_app_id character varying,
  p_channel_id bigint
) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
BEGIN
  IF p_channel_id IS NOT NULL THEN
    -- No channel-level role mapping for now
    RETURN NULL;
  ELSIF p_app_id IS NOT NULL THEN
    -- App-level legacy mapping to RBAC roles
    IF p_user_right >= public.rbac_right_admin()::public.user_min_right THEN
      RETURN public.rbac_role_app_admin();
    ELSIF p_user_right = public.rbac_right_write()::public.user_min_right THEN
      RETURN public.rbac_role_app_developer();
    ELSIF p_user_right = public.rbac_right_upload()::public.user_min_right THEN
      RETURN public.rbac_role_app_uploader();
    ELSIF p_user_right = public.rbac_right_read()::public.user_min_right THEN
      RETURN public.rbac_role_app_reader();
    END IF;
    RETURN NULL;
  ELSE
    -- Org-level legacy mapping
    IF p_user_right >= public.rbac_right_super_admin()::public.user_min_right THEN
      RETURN public.rbac_role_org_super_admin();
    ELSIF p_user_right >= public.rbac_right_admin()::public.user_min_right THEN
      RETURN public.rbac_role_org_admin();
    ELSIF p_user_right = public.rbac_right_write()::public.user_min_right THEN
      -- Org-level write creates org_member + app_developer for each app
      RETURN 'org_member + app_developer(per-app)';
    ELSIF p_user_right = public.rbac_right_upload()::public.user_min_right THEN
      -- Org-level upload creates org_member + app_uploader for each app
      RETURN 'org_member + app_uploader(per-app)';
    ELSIF p_user_right = public.rbac_right_read()::public.user_min_right THEN
      -- Org-level read creates org_member + app_reader for each app
      RETURN 'org_member + app_reader(per-app)';
    END IF;
    RETURN NULL;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) IS 'Heuristic mapping from legacy org_users rows to Phase 1 priority roles. For org-level read/upload/write, returns composite string indicating org_member + per-app role pattern used during migration.';

-- 14) Migration utility to convert org_users to role_bindings
CREATE OR REPLACE FUNCTION public.rbac_migrate_org_users_to_bindings(
  p_org_id uuid,
  p_granted_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_granted_by uuid;
  v_org_user RECORD;
  v_app RECORD;
  v_role_name text;
  v_app_role_name text;
  v_role_id uuid;
  v_app_role_id uuid;
  v_scope_type text;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_binding_id uuid;
  v_migrated_count int := 0;
  v_skipped_count int := 0;
  v_error_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_migration_reason text := 'Migrated from org_users (legacy)';
BEGIN
  -- Use provided granted_by or find org owner
  IF p_granted_by IS NULL THEN
    SELECT created_by INTO v_granted_by FROM public.orgs WHERE id = p_org_id LIMIT 1;
    IF v_granted_by IS NULL THEN
      -- Fallback: use first admin user in org
      SELECT user_id INTO v_granted_by
      FROM public.org_users
      WHERE org_id = p_org_id
        AND user_right >= public.rbac_right_admin()::public.user_min_right
        AND app_id IS NULL
        AND channel_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    IF v_granted_by IS NULL THEN
      RAISE EXCEPTION 'Cannot determine granted_by user for org %', p_org_id;
    END IF;
  ELSE
    v_granted_by := p_granted_by;
  END IF;

  -- Iterate through all org_users for this org
  FOR v_org_user IN
    SELECT id, user_id, org_id, app_id, channel_id, user_right
    FROM public.org_users
    WHERE org_id = p_org_id
  LOOP
    BEGIN
      -- Special handling for org-level read/upload/write: create org_member + app-level roles
      IF v_org_user.app_id IS NULL AND v_org_user.channel_id IS NULL
         AND v_org_user.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN

        -- 1) Create org_member binding
        SELECT id INTO v_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;
        IF v_role_id IS NOT NULL THEN
          -- Check if org_member binding already exists
          SELECT id INTO v_binding_id FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_user()
            AND principal_id = v_org_user.user_id
            AND role_id = v_role_id
            AND scope_type = public.rbac_scope_org()
            AND org_id = p_org_id
          LIMIT 1;

          IF v_binding_id IS NULL THEN
            INSERT INTO public.role_bindings (
              principal_type, principal_id, role_id, scope_type, org_id,
              granted_by, granted_at, reason, is_direct
            ) VALUES (
              public.rbac_principal_user(), v_org_user.user_id, v_role_id, public.rbac_scope_org(), p_org_id,
              v_granted_by, now(), v_migration_reason, true
            );
            v_migrated_count := v_migrated_count + 1;
          END IF;
        END IF;

        -- 2) Determine app-level role based on user_right
        IF v_org_user.user_right = public.rbac_right_read() THEN
          v_app_role_name := public.rbac_role_app_reader();
        ELSIF v_org_user.user_right = public.rbac_right_upload() THEN
          v_app_role_name := public.rbac_role_app_uploader();
        ELSIF v_org_user.user_right = public.rbac_right_write() THEN
          v_app_role_name := public.rbac_role_app_developer();
        END IF;

        SELECT id INTO v_app_role_id FROM public.roles WHERE name = v_app_role_name LIMIT 1;
        IF v_app_role_id IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'app_role_not_found',
            'role_name', v_app_role_name
          );
          CONTINUE;
        END IF;

        -- 3) Create app-level binding for EACH app in the org
        FOR v_app IN
          SELECT id, app_id FROM public.apps WHERE owner_org = p_org_id
        LOOP
          -- Check if app binding already exists
          SELECT id INTO v_binding_id FROM public.role_bindings
          WHERE principal_type = public.rbac_principal_user()
            AND principal_id = v_org_user.user_id
            AND role_id = v_app_role_id
            AND scope_type = public.rbac_scope_app()
            AND app_id = v_app.id
          LIMIT 1;

          IF v_binding_id IS NULL THEN
            INSERT INTO public.role_bindings (
              principal_type, principal_id, role_id, scope_type, org_id, app_id,
              granted_by, granted_at, reason, is_direct
            ) VALUES (
              public.rbac_principal_user(), v_org_user.user_id, v_app_role_id, public.rbac_scope_app(), p_org_id, v_app.id,
              v_granted_by, now(), v_migration_reason, true
            );
            v_migrated_count := v_migrated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END LOOP;

        CONTINUE; -- Skip standard processing for this org_user
      END IF;

      -- Standard processing for app/channel-specific rights or admin rights
      v_role_name := public.rbac_legacy_role_hint(
        v_org_user.user_right,
        v_org_user.app_id,
        v_org_user.channel_id
      );

      -- Skip if no suitable role
      IF v_role_name IS NULL THEN
        v_skipped_count := v_skipped_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'org_user_id', v_org_user.id,
          'user_id', v_org_user.user_id,
          'reason', 'no_suitable_role',
          'user_right', v_org_user.user_right::text,
          'app_id', v_org_user.app_id,
          'channel_id', v_org_user.channel_id
        );
        CONTINUE;
      END IF;

      -- Get role ID
      SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name LIMIT 1;
      IF v_role_id IS NULL THEN
        v_error_count := v_error_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'org_user_id', v_org_user.id,
          'user_id', v_org_user.user_id,
          'reason', 'role_not_found',
          'role_name', v_role_name
        );
        CONTINUE;
      END IF;

      -- Determine scope type and resolve IDs
      IF v_org_user.channel_id IS NOT NULL THEN
        v_scope_type := public.rbac_scope_channel();
        SELECT id INTO v_app_uuid FROM public.apps
        WHERE app_id = v_org_user.app_id LIMIT 1;
        SELECT rbac_id INTO v_channel_uuid FROM public.channels
        WHERE id = v_org_user.channel_id LIMIT 1;

        IF v_app_uuid IS NULL OR v_channel_uuid IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'channel_or_app_not_found',
            'app_id', v_org_user.app_id,
            'channel_id', v_org_user.channel_id
          );
          CONTINUE;
        END IF;
      ELSIF v_org_user.app_id IS NOT NULL THEN
        v_scope_type := public.rbac_scope_app();
        SELECT id INTO v_app_uuid FROM public.apps
        WHERE app_id = v_org_user.app_id LIMIT 1;
        v_channel_uuid := NULL;

        IF v_app_uuid IS NULL THEN
          v_error_count := v_error_count + 1;
          v_errors := v_errors || jsonb_build_object(
            'org_user_id', v_org_user.id,
            'reason', 'app_not_found',
            'app_id', v_org_user.app_id
          );
          CONTINUE;
        END IF;
      ELSE
        v_scope_type := public.rbac_scope_org();
        v_app_uuid := NULL;
        v_channel_uuid := NULL;
      END IF;

      -- Check if binding already exists (idempotency)
      SELECT id INTO v_binding_id FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = v_org_user.user_id
        AND role_id = v_role_id
        AND scope_type = v_scope_type
        AND org_id = p_org_id
        AND (app_id = v_app_uuid OR (app_id IS NULL AND v_app_uuid IS NULL))
        AND (channel_id = v_channel_uuid OR (channel_id IS NULL AND v_channel_uuid IS NULL))
      LIMIT 1;

      IF v_binding_id IS NOT NULL THEN
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      -- Create role binding
      INSERT INTO public.role_bindings (
        principal_type,
        principal_id,
        role_id,
        scope_type,
        org_id,
        app_id,
        channel_id,
        granted_by,
        granted_at,
        reason,
        is_direct
      ) VALUES (
        public.rbac_principal_user(),
        v_org_user.user_id,
        v_role_id,
        v_scope_type,
        p_org_id,
        v_app_uuid,
        v_channel_uuid,
        v_granted_by,
        now(),
        v_migration_reason,
        true
      );

      v_migrated_count := v_migrated_count + 1;

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'org_user_id', v_org_user.id,
        'user_id', v_org_user.user_id,
        'reason', 'exception',
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'granted_by', v_granted_by,
    'migrated_count', v_migrated_count,
    'skipped_count', v_skipped_count,
    'error_count', v_error_count,
    'errors', v_errors
  );
END;
$$;
COMMENT ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid) IS 'Migrates org_users records to role_bindings for a specific org. Idempotent and returns migration report.';

-- Convenience function: migrate and enable RBAC for an org in one call
CREATE OR REPLACE FUNCTION public.rbac_enable_for_org(
  p_org_id uuid,
  p_granted_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_migration_result jsonb;
  v_was_enabled boolean;
BEGIN
  -- Check if already enabled
  SELECT use_new_rbac INTO v_was_enabled FROM public.orgs WHERE id = p_org_id;
  IF v_was_enabled THEN
    RETURN jsonb_build_object(
      'status', 'already_enabled',
      'org_id', p_org_id,
      'message', 'RBAC was already enabled for this org'
    );
  END IF;

  -- Migrate org_users to role_bindings
  v_migration_result := public.rbac_migrate_org_users_to_bindings(p_org_id, p_granted_by);

  -- Enable RBAC flag
  UPDATE public.orgs SET use_new_rbac = true WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'org_id', p_org_id,
    'migration_result', v_migration_result,
    'rbac_enabled', true
  );
END;
$$;
COMMENT ON FUNCTION public.rbac_enable_for_org(uuid, uuid) IS 'Migrates org_users to role_bindings and enables RBAC for an org in one transaction.';

-- Helper: preview migration without executing it
CREATE OR REPLACE FUNCTION public.rbac_preview_migration(
  p_org_id uuid
) RETURNS TABLE(
  org_user_id bigint,
  user_id uuid,
  user_right text,
  app_id character varying,
  channel_id bigint,
  suggested_role text,
  scope_type text,
  will_migrate boolean,
  skip_reason text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ou.id AS org_user_id,
    ou.user_id,
    ou.user_right::text AS user_right,
    ou.app_id,
    ou.channel_id,
    public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) AS suggested_role,
    CASE
      WHEN ou.channel_id IS NOT NULL THEN public.rbac_scope_channel()
      WHEN ou.app_id IS NOT NULL THEN public.rbac_scope_app()
      ELSE public.rbac_scope_org()
    END AS scope_type,
    public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) IS NOT NULL AS will_migrate,
    CASE
      WHEN public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) IS NULL THEN 'no_suitable_role'
      ELSE NULL
    END AS skip_reason
  FROM public.org_users ou
  WHERE ou.org_id = p_org_id
  ORDER BY ou.user_id, ou.app_id NULLS FIRST, ou.channel_id NULLS FIRST;
END;
$$;
COMMENT ON FUNCTION public.rbac_preview_migration(uuid) IS 'Preview what would be migrated for an org without making changes.';

-- Helper: rollback migration (remove migrated bindings and disable RBAC)
CREATE OR REPLACE FUNCTION public.rbac_rollback_org(
  p_org_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_deleted_count int;
  v_migration_reason text := 'Migrated from org_users (legacy)';
BEGIN
  -- Delete all role_bindings that were migrated from org_users
  DELETE FROM public.role_bindings
  WHERE org_id = p_org_id
    AND reason = v_migration_reason
    AND is_direct = true;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Disable RBAC flag
  UPDATE public.orgs SET use_new_rbac = false WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'org_id', p_org_id,
    'deleted_bindings', v_deleted_count,
    'rbac_enabled', false
  );
END;
$$;
COMMENT ON FUNCTION public.rbac_rollback_org(uuid) IS 'Removes migrated role_bindings and disables RBAC for an org (rollback migration).';

-- 15) Fix invite_user_to_org permission check logic
CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" (
  "email" varchar,
  "org_id" uuid,
  "invite_type" public.user_min_right
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  calling_user_id uuid;
BEGIN
  -- Get the calling user's ID
  SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)
  INTO calling_user_id;

  -- Check if org exists
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  -- Check if user has at least public.rbac_right_admin() rights
  IF NOT public.check_min_rights(public.rbac_right_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'email', invite_user_to_org.email, 'invite_type', invite_user_to_org.invite_type, 'calling_user', calling_user_id));
    RETURN 'NO_RIGHTS';
  END IF;

  -- If inviting as super_admin, caller must be super_admin
  IF (invite_type = public.rbac_right_super_admin()::public.user_min_right OR invite_type = public.rbac_right_invite_super_admin()::public.user_min_right) THEN
    IF NOT public.check_min_rights(public.rbac_right_super_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'email', invite_user_to_org.email, 'invite_type', invite_user_to_org.invite_type, 'calling_user', calling_user_id));
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  -- Check if user already exists
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- User exists, check if already in org
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      -- Add user to org
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);
      RETURN 'OK';
    END IF;
  ELSE
    -- User doesn't exist, check tmp_users for pending invitations
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

    IF current_tmp_user IS NOT NULL THEN
      -- Invitation already exists
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Invitation was cancelled, check if recent
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      -- No invitation exists, need to create one (handled elsewhere)
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_org(varchar, uuid, public.user_min_right) IS
'Invite a user to an organization. Admins can invite read/upload/write/admin roles. Super admins can invite super_admin roles.';

-- 16) Add use_new_rbac flag to get_orgs_v6 return type
DROP FUNCTION IF EXISTS public.get_orgs_v6();
DROP FUNCTION IF EXISTS public.get_orgs_v6(uuid);

-- Update the overload with user_id parameter
CREATE OR REPLACE FUNCTION "public"."get_orgs_v6" ("userid" "uuid") RETURNS TABLE (
  "gid" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying,
  "paying" boolean,
  "trial_left" integer,
  "can_use_more" boolean,
  "is_canceled" boolean,
  "app_count" bigint,
  "subscription_start" timestamp with time zone,
  "subscription_end" timestamp with time zone,
  "management_email" "text",
  "is_yearly" boolean,
  "use_new_rbac" boolean
) LANGUAGE "plpgsql"
SET search_path = '' SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id AS gid,
    sub.created_by,
    sub.logo,
    sub.name,
    org_users.user_right::varchar AS role,
    public.is_paying_org(sub.id) AS paying,
    public.is_trial_org(sub.id) AS trial_left,
    public.is_allowed_action_org(sub.id) AS can_use_more,
    public.is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM public.apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email AS management_email,
    public.is_org_yearly(sub.id) AS is_yearly,
    sub.use_new_rbac AS use_new_rbac
  FROM (
    SELECT public.get_cycle_info_org(o.id) AS f, o.* FROM public.orgs AS o
  ) sub
  JOIN public.org_users ON (org_users."user_id" = get_orgs_v6.userid AND sub.id = org_users."org_id");
END;
$$;

-- Update the overload without parameters (calls the one above)
CREATE OR REPLACE FUNCTION "public"."get_orgs_v6" () RETURNS TABLE (
  "gid" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying,
  "paying" boolean,
  "trial_left" integer,
  "can_use_more" boolean,
  "is_canceled" boolean,
  "app_count" bigint,
  "subscription_start" timestamp with time zone,
  "subscription_end" timestamp with time zone,
  "management_email" "text",
  "is_yearly" boolean,
  "use_new_rbac" boolean
) LANGUAGE "plpgsql"
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  user_id := NULL;

  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    user_id := api_key.user_id;

    -- Check limited_to_orgs only if api_key exists and has restrictions
    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      return query select orgs.* FROM public.get_orgs_v6(user_id) orgs
      where orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  -- If no valid API key user_id yet, try to get FROM public.identity
  IF user_id IS NULL THEN
    SELECT public.get_identity() into user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  return query select * FROM public.get_orgs_v6(user_id);
END;
$$;

COMMENT ON FUNCTION public.get_orgs_v6(uuid) IS 'Get organizations for a user, including use_new_rbac flag for per-org RBAC rollout';
COMMENT ON FUNCTION public.get_orgs_v6() IS 'Get organizations for authenticated user or API key, including use_new_rbac flag';

-- 16b) RBAC-aware org id list for user or API key
CREATE OR REPLACE FUNCTION "public"."get_user_org_ids"() RETURNS TABLE (
  "org_id" "uuid"
) LANGUAGE "plpgsql"
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  v_user_id uuid;
  limited_orgs uuid[];
  has_limited_orgs boolean := false;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  v_user_id := NULL;

  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    v_user_id := api_key.user_id;
    limited_orgs := api_key.limited_to_orgs;
    has_limited_orgs := COALESCE(array_length(limited_orgs, 1), 0) > 0;
  END IF;

  -- If no valid API key v_user_id yet, try to get FROM public.identity
  IF v_user_id IS NULL THEN
    SELECT public.get_identity() into v_user_id;

    IF v_user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY
  WITH role_orgs AS (
    -- Direct role bindings on org scope
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Group role bindings on org scope
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- App scope bindings (user)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- App scope bindings (group)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Channel scope bindings (user)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    -- Channel scope bindings (group)
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  legacy_orgs AS (
    SELECT org_users.org_id AS org_uuid
    FROM public.org_users
    WHERE org_users.user_id = v_user_id
  ),
  all_orgs AS (
    SELECT org_uuid FROM legacy_orgs
    UNION
    SELECT org_uuid FROM role_orgs
  )
  SELECT ao.org_uuid AS org_id
  FROM all_orgs ao
  WHERE ao.org_uuid IS NOT NULL
    AND (
      NOT has_limited_orgs
      OR ao.org_uuid = ANY(limited_orgs)
    );
END;
$$;

ALTER FUNCTION "public"."get_user_org_ids"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_user_org_ids"() TO "authenticated";

COMMENT ON FUNCTION public.get_user_org_ids() IS
  'RBAC/legacy-aware org id list for authenticated user or API key (includes org_users and role_bindings membership).';

-- ============================================================================
-- RBAC-AWARE is_admin() OVERRIDE
-- ============================================================================

-- Override is_admin() to check RBAC platform roles when RBAC is enabled globally
CREATE OR REPLACE FUNCTION public.is_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_admin_legacy boolean := false;
  mfa_verified boolean;
  rbac_enabled boolean;
  has_platform_admin boolean := false;
BEGIN
  -- Always check MFA first
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  -- Always check legacy vault list (for bootstrapping and backward compatibility)
  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb
  FROM vault.decrypted_secrets WHERE name = 'admin_users';
  is_admin_legacy := (admin_ids_jsonb ? userid::text);

  -- Check if RBAC is enabled globally
  SELECT use_new_rbac INTO rbac_enabled FROM public.rbac_settings WHERE id = 1;

  IF COALESCE(rbac_enabled, false) THEN
    -- RBAC mode: also check for platform_super_admin role binding
    SELECT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = userid
        AND rb.scope_type = public.rbac_scope_platform()
        AND r.name = public.rbac_role_platform_super_admin()
    ) INTO has_platform_admin;

    -- In RBAC mode: admin if EITHER in vault list OR has platform role
    RETURN is_admin_legacy OR has_platform_admin;
  ELSE
    -- Legacy mode: only use vault secret list
    RETURN is_admin_legacy;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS 'Check if user is platform admin. In RBAC mode: checks vault list OR platform_super_admin role (allows bootstrapping). In legacy mode: only checks vault list. Always requires MFA.';

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- 1) rbac_settings: Global singleton, admin-only writes, authenticated reads
ALTER TABLE public.rbac_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY rbac_settings_read_authenticated ON public.rbac_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY rbac_settings_admin_all ON public.rbac_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2) roles: Public read (needed for UI role lists), admin-only writes
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_read_all ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY roles_admin_write ON public.roles
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) permissions: Public read (needed for permission resolution), admin-only writes
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_read_all ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY permissions_admin_write ON public.permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) role_permissions: Public read (needed for permission resolution), admin-only writes
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_read_all ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY role_permissions_admin_write ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5) role_hierarchy: Public read (needed for permission resolution), admin-only writes
ALTER TABLE public.role_hierarchy ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_hierarchy_read_all ON public.role_hierarchy
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY role_hierarchy_admin_write ON public.role_hierarchy
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 6) groups: Read/write for org members with appropriate rights
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY groups_read_org_member ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    -- User is member of the org
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = groups.org_id
        AND org_users.user_id = auth.uid()
    )
    OR
    -- User is platform admin
    public.is_admin(auth.uid())
  );

CREATE POLICY groups_write_org_admin ON public.groups
  FOR ALL
  TO authenticated
  USING (
    -- User has admin rights in the org
    public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint)
    OR
    -- User is platform admin
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    -- User has admin rights in the org
    public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint)
    OR
    -- User is platform admin
    public.is_admin(auth.uid())
  );

-- 7) group_members: Read/write for org members with appropriate rights
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_members_read_org_member ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    -- User is member of the org that owns the group
    EXISTS (
      SELECT 1 FROM public.groups
      JOIN public.org_users ON org_users.org_id = groups.org_id
      WHERE groups.id = group_members.group_id
        AND org_users.user_id = auth.uid()
    )
    OR
    -- User is platform admin
    public.is_admin(auth.uid())
  );

CREATE POLICY group_members_write_org_admin ON public.group_members
  FOR ALL
  TO authenticated
  USING (
    -- User has admin rights in the org that owns the group
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE groups.id = group_members.group_id
        AND (
          public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), groups.org_id, NULL::varchar, NULL::bigint)
          OR public.is_admin(auth.uid())
        )
    )
  )
  WITH CHECK (
    -- User has admin rights in the org that owns the group
    EXISTS (
      SELECT 1 FROM public.groups
      WHERE groups.id = group_members.group_id
        AND (
          public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), groups.org_id, NULL::varchar, NULL::bigint)
          OR public.is_admin(auth.uid())
        )
    )
  );

-- 8) role_bindings: Read/write based on scope and org membership
ALTER TABLE public.role_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_bindings_read_scope_member ON public.role_bindings
  FOR SELECT
  TO authenticated
  USING (
    -- Platform scope: admin only
    (scope_type = public.rbac_scope_platform() AND public.is_admin(auth.uid()))
    OR
    -- Org scope: org member
    (scope_type = public.rbac_scope_org() AND EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = role_bindings.org_id
        AND org_users.user_id = auth.uid()
    ))
    OR
    -- App scope: org member (app belongs to org)
    (scope_type = public.rbac_scope_app() AND EXISTS (
      SELECT 1 FROM public.apps
      JOIN public.org_users ON org_users.org_id = apps.owner_org
      WHERE apps.id = role_bindings.app_id
        AND org_users.user_id = auth.uid()
    ))
    OR
    -- Channel scope: org member (channel belongs to app belongs to org)
    (scope_type = public.rbac_scope_channel() AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      JOIN public.org_users ON org_users.org_id = apps.owner_org
      WHERE channels.rbac_id = role_bindings.channel_id
        AND org_users.user_id = auth.uid()
    ))
    OR
    -- Platform admin sees all
    public.is_admin(auth.uid())
  );

CREATE POLICY role_bindings_write_scope_admin ON public.role_bindings
  FOR ALL
  TO authenticated
  USING (
    -- Platform scope: admin only
    (scope_type = public.rbac_scope_platform() AND public.is_admin(auth.uid()))
    OR
    -- Org scope: org admin
    (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint))
    OR
    -- App scope: app admin
    (scope_type = public.rbac_scope_app() AND EXISTS (
      SELECT 1 FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    -- Channel scope: channel admin
    (scope_type = public.rbac_scope_channel() AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), apps.owner_org, channels.app_id, channels.id)
    ))
    OR
    -- Platform admin can write all
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    -- Same as USING clause
    (scope_type = public.rbac_scope_platform() AND public.is_admin(auth.uid()))
    OR
    (scope_type = public.rbac_scope_org() AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), org_id, NULL::varchar, NULL::bigint))
    OR
    (scope_type = public.rbac_scope_app() AND EXISTS (
      SELECT 1 FROM public.apps
      WHERE apps.id = role_bindings.app_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), apps.owner_org, apps.app_id, NULL::bigint)
    ))
    OR
    (scope_type = public.rbac_scope_channel() AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.apps ON apps.app_id = channels.app_id
      WHERE channels.rbac_id = role_bindings.channel_id
        AND public.check_min_rights(public.rbac_right_admin()::public.user_min_right, auth.uid(), apps.owner_org, channels.app_id, channels.id)
    ))
    OR
    public.is_admin(auth.uid())
  );

-- =============================================================================
-- AUTO-MIGRATION: Convert all existing org_users to role_bindings
-- =============================================================================
-- This block runs automatically when the migration is applied in production.
-- It's idempotent - safe to run multiple times as it skips existing bindings.

DO $$
DECLARE
  v_org RECORD;
  v_migration_result jsonb;
  v_total_migrated int := 0;
  v_total_skipped int := 0;
  v_total_errors int := 0;
  v_orgs_processed int := 0;
BEGIN
  RAISE NOTICE 'Starting automatic RBAC migration for all organizations...';

  -- Migrate org_users to role_bindings for each organization
  FOR v_org IN SELECT id, name FROM public.orgs ORDER BY created_at
  LOOP
    BEGIN
      v_orgs_processed := v_orgs_processed + 1;

      -- Call migration function for this org
      SELECT public.rbac_migrate_org_users_to_bindings(v_org.id) INTO v_migration_result;

      -- Accumulate statistics
      v_total_migrated := v_total_migrated + (v_migration_result->>'migrated_count')::int;
      v_total_skipped := v_total_skipped + (v_migration_result->>'skipped_count')::int;
      v_total_errors := v_total_errors + (v_migration_result->>'error_count')::int;

      RAISE NOTICE 'Org [%] "%": migrated=%, skipped=%, errors=%',
        v_org.id, v_org.name,
        v_migration_result->>'migrated_count',
        v_migration_result->>'skipped_count',
        v_migration_result->>'error_count';

      -- Log errors if any
      IF (v_migration_result->>'error_count')::int > 0 THEN
        RAISE WARNING 'Errors during migration for org %: %', v_org.id, v_migration_result->'errors';
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to migrate org % (%): %', v_org.id, v_org.name, SQLERRM;
      v_total_errors := v_total_errors + 1;
    END;
  END LOOP;

  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'RBAC auto-migration completed:';
  RAISE NOTICE '  Organizations processed: %', v_orgs_processed;
  RAISE NOTICE '  Total bindings created: %', v_total_migrated;
  RAISE NOTICE '  Total bindings skipped: %', v_total_skipped;
  RAISE NOTICE '  Total errors: %', v_total_errors;
  RAISE NOTICE '=============================================================================';

  IF v_total_errors > 0 THEN
    RAISE WARNING 'Migration completed with % errors. Review logs above.', v_total_errors;
  END IF;
END $$;

-- =============================================================================
-- Sync org_users and role_bindings on user/org creation
-- =============================================================================
-- This section ensures that when a user is added to an org, entries are created in both:
-- 1. org_users (legacy system)
-- 2. role_bindings (new RBAC system)
-- This allows switching between both systems during transition.

-- Update the trigger function that creates org_users entries to also create role_bindings entries
CREATE OR REPLACE FUNCTION "public"."generate_org_user_on_org_create"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  org_super_admin_role_id uuid;
BEGIN
  -- Create org_users entry (legacy system)
  INSERT INTO public.org_users (user_id, org_id, user_right)
  VALUES (NEW.created_by, NEW.id, public.rbac_right_super_admin()::"public"."user_min_right");

  -- Get the org_super_admin role ID for role_bindings
  SELECT id INTO org_super_admin_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_super_admin()
  LIMIT 1;

  -- Create role_bindings entry (new RBAC system) if role exists
  IF org_super_admin_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      granted_by,
      granted_at,
      reason,
      is_direct
    ) VALUES (
      public.rbac_principal_user(),
      NEW.created_by,
      org_super_admin_role_id,
      public.rbac_scope_org(),
      NEW.id,
      NEW.created_by, -- The user grants themselves super_admin on their own org
      now(),
      'Auto-granted on org creation',
      true
    )
    -- Only insert if not already exists (in case of re-run or manual entry)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."generate_org_user_on_org_create"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."generate_org_user_on_org_create"() IS
  'Creates entries in both org_users (legacy) and role_bindings (RBAC) when an org is created, allowing dual-system operation during transition.';

-- Create a function for when users are manually added to orgs
-- This would be triggered by inserts into org_users table
CREATE OR REPLACE FUNCTION "public"."sync_org_user_to_role_binding"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  role_name_to_bind text;
  role_id_to_bind uuid;
  org_member_role_id uuid;
  app_role_name text;
  app_role_id uuid;
  v_app RECORD;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_granted_by uuid;
  v_sync_reason text := 'Synced from org_users';
BEGIN
  v_granted_by := COALESCE(auth.uid(), NEW.user_id);

  -- Handle org-level rights (no app_id, no channel_id)
  IF NEW.app_id IS NULL AND NEW.channel_id IS NULL THEN
    -- For super_admin and admin: create org-level binding directly
    IF NEW.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) THEN
      CASE NEW.user_right
        WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_org_super_admin();
        WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_org_admin();
      END CASE;

      SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;

      IF role_id_to_bind IS NOT NULL THEN
        INSERT INTO public.role_bindings (
          principal_type, principal_id, role_id, scope_type, org_id,
          granted_by, granted_at, reason, is_direct
        ) VALUES (
          public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_org(), NEW.org_id,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;

    -- For read/upload/write at org level: create org_member + app-level roles for each app
    ELSIF NEW.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN
      -- 1) Create org_member binding at org level
      SELECT id INTO org_member_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;
      IF org_member_role_id IS NOT NULL THEN
        INSERT INTO public.role_bindings (
          principal_type, principal_id, role_id, scope_type, org_id,
          granted_by, granted_at, reason, is_direct
        ) VALUES (
          public.rbac_principal_user(), NEW.user_id, org_member_role_id, public.rbac_scope_org(), NEW.org_id,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;

      -- 2) Determine app-level role based on user_right
      CASE NEW.user_right
        WHEN public.rbac_right_read() THEN app_role_name := public.rbac_role_app_reader();
        WHEN public.rbac_right_upload() THEN app_role_name := public.rbac_role_app_uploader();
        WHEN public.rbac_right_write() THEN app_role_name := public.rbac_role_app_developer();
      END CASE;

      SELECT id INTO app_role_id FROM public.roles WHERE name = app_role_name LIMIT 1;

      -- 3) Create app-level binding for EACH app in the org
      IF app_role_id IS NOT NULL THEN
        FOR v_app IN SELECT id FROM public.apps WHERE owner_org = NEW.org_id
        LOOP
          INSERT INTO public.role_bindings (
            principal_type, principal_id, role_id, scope_type, org_id, app_id,
            granted_by, granted_at, reason, is_direct
          ) VALUES (
            public.rbac_principal_user(), NEW.user_id, app_role_id, public.rbac_scope_app(), NEW.org_id, v_app.id,
            v_granted_by, now(), v_sync_reason, true
          ) ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END IF;

  -- Handle app-level rights (has app_id, no channel_id)
  ELSIF NEW.app_id IS NOT NULL AND NEW.channel_id IS NULL THEN
    CASE NEW.user_right
      WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_app_admin();
      WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_app_admin();
      WHEN public.rbac_right_write() THEN role_name_to_bind := public.rbac_role_app_developer();
      WHEN public.rbac_right_upload() THEN role_name_to_bind := public.rbac_role_app_uploader();
      WHEN public.rbac_right_read() THEN role_name_to_bind := public.rbac_role_app_reader();
      ELSE role_name_to_bind := public.rbac_role_app_reader();
    END CASE;

    SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;
    SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = NEW.app_id LIMIT 1;

    IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL THEN
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_app(), NEW.org_id, v_app_uuid,
        v_granted_by, now(), v_sync_reason, true
      ) ON CONFLICT DO NOTHING;
    END IF;

  -- Handle channel-level rights (has app_id and channel_id)
  ELSIF NEW.app_id IS NOT NULL AND NEW.channel_id IS NOT NULL THEN
    CASE NEW.user_right
      WHEN public.rbac_right_super_admin() THEN role_name_to_bind := public.rbac_role_channel_admin();
      WHEN public.rbac_right_admin() THEN role_name_to_bind := public.rbac_role_channel_admin();
      WHEN public.rbac_right_write() THEN role_name_to_bind := 'channel_developer';
      WHEN public.rbac_right_upload() THEN role_name_to_bind := 'channel_uploader';
      WHEN public.rbac_right_read() THEN role_name_to_bind := public.rbac_role_channel_reader();
      ELSE role_name_to_bind := public.rbac_role_channel_reader();
    END CASE;

    SELECT id INTO role_id_to_bind FROM public.roles WHERE name = role_name_to_bind LIMIT 1;
    SELECT id INTO v_app_uuid FROM public.apps WHERE app_id = NEW.app_id LIMIT 1;
    SELECT rbac_id INTO v_channel_uuid FROM public.channels WHERE id = NEW.channel_id LIMIT 1;

    IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL AND v_channel_uuid IS NOT NULL THEN
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id, channel_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, role_id_to_bind, public.rbac_scope_channel(), NEW.org_id, v_app_uuid, v_channel_uuid,
        v_granted_by, now(), v_sync_reason, true
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_org_user_to_role_binding"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."sync_org_user_to_role_binding"() IS
  'Automatically creates/updates role_bindings entries when org_users entries are inserted, ensuring both systems stay in sync. For org-level read/upload/write rights, creates org_member + app-level roles for each app.';

-- Create trigger to sync org_users insertions to role_bindings
DROP TRIGGER IF EXISTS sync_org_user_to_role_binding_on_insert ON public.org_users;
CREATE TRIGGER sync_org_user_to_role_binding_on_insert
AFTER INSERT ON public.org_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_org_user_to_role_binding();

COMMENT ON TRIGGER sync_org_user_to_role_binding_on_insert ON public.org_users IS
  'Ensures role_bindings are created automatically when org_users entries are added.';

-- =============================================================================
-- Sync role_bindings on org_users UPDATE (user_right change)
-- =============================================================================
-- This function handles when a member's permission is changed from the org settings UI.
-- It updates all role_bindings for that user across all apps in the org.

CREATE OR REPLACE FUNCTION "public"."sync_org_user_role_binding_on_update"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  old_org_role_name text;
  new_org_role_name text;
  old_org_role_id uuid;
  new_org_role_id uuid;
  old_app_role_name text;
  new_app_role_name text;
  old_app_role_id uuid;
  new_app_role_id uuid;
  org_member_role_id uuid;
  v_app RECORD;
  v_granted_by uuid;
  v_update_reason text := 'Updated from org_users';
BEGIN
  -- Only process if user_right actually changed
  IF OLD.user_right = NEW.user_right THEN
    RETURN NEW;
  END IF;

  -- Only handle org-level rights (no app_id, no channel_id)
  IF NEW.app_id IS NOT NULL OR NEW.channel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_granted_by := COALESCE(auth.uid(), NEW.user_id);

  -- Map old user_right to role names
  CASE OLD.user_right
    WHEN public.rbac_right_super_admin() THEN
      old_org_role_name := public.rbac_role_org_super_admin();
      old_app_role_name := NULL;
    WHEN public.rbac_right_admin() THEN
      old_org_role_name := public.rbac_role_org_admin();
      old_app_role_name := NULL;
    WHEN public.rbac_right_write() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_developer();
    WHEN public.rbac_right_upload() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_uploader();
    WHEN public.rbac_right_read() THEN
      old_org_role_name := public.rbac_role_org_member();
      old_app_role_name := public.rbac_role_app_reader();
    WHEN 'invite_super_admin'::public.user_min_right THEN
      -- Invite roles don't have role_bindings yet; they're pending invitations
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_admin'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_write'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_upload'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    WHEN 'invite_read'::public.user_min_right THEN
      old_org_role_name := NULL;
      old_app_role_name := NULL;
    ELSE
      -- Handle any unexpected values by logging and returning unchanged
      RAISE WARNING 'Unexpected OLD.user_right value: %, skipping role binding sync', OLD.user_right;
      RETURN NEW;
  END CASE;

  -- Map new user_right to role names
  CASE NEW.user_right
    WHEN public.rbac_right_super_admin() THEN
      new_org_role_name := public.rbac_role_org_super_admin();
      new_app_role_name := NULL;
    WHEN public.rbac_right_admin() THEN
      new_org_role_name := public.rbac_role_org_admin();
      new_app_role_name := NULL;
    WHEN public.rbac_right_write() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_developer();
    WHEN public.rbac_right_upload() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_uploader();
    WHEN public.rbac_right_read() THEN
      new_org_role_name := public.rbac_role_org_member();
      new_app_role_name := public.rbac_role_app_reader();
    WHEN 'invite_super_admin'::public.user_min_right THEN
      -- Invite roles don't create role_bindings yet; they're pending invitations
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_admin'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_write'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_upload'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    WHEN 'invite_read'::public.user_min_right THEN
      new_org_role_name := NULL;
      new_app_role_name := NULL;
    ELSE
      -- Handle any unexpected values by logging and returning unchanged
      RAISE WARNING 'Unexpected NEW.user_right value: %, skipping role binding sync', NEW.user_right;
      RETURN NEW;
  END CASE;

  -- Get role IDs
  IF old_org_role_name IS NOT NULL THEN
    SELECT id INTO old_org_role_id FROM public.roles WHERE name = old_org_role_name LIMIT 1;
  END IF;
  
  IF new_org_role_name IS NOT NULL THEN
    SELECT id INTO new_org_role_id FROM public.roles WHERE name = new_org_role_name LIMIT 1;
  END IF;
  SELECT id INTO org_member_role_id FROM public.roles WHERE name = public.rbac_role_org_member() LIMIT 1;

  IF old_app_role_name IS NOT NULL THEN
    SELECT id INTO old_app_role_id FROM public.roles WHERE name = old_app_role_name LIMIT 1;
  END IF;

  IF new_app_role_name IS NOT NULL THEN
    SELECT id INTO new_app_role_id FROM public.roles WHERE name = new_app_role_name LIMIT 1;
  END IF;

  -- Delete old org-level binding (only if there was a role)
  IF old_org_role_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_org()
      AND org_id = NEW.org_id
      AND role_id = old_org_role_id;
  END IF;

  -- Delete old app-level bindings (for read/upload/write users)
  IF old_app_role_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_app()
      AND org_id = NEW.org_id
      AND role_id = old_app_role_id;
  END IF;

  -- Create new org-level binding
  IF new_org_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type, principal_id, role_id, scope_type, org_id,
      granted_by, granted_at, reason, is_direct
    ) VALUES (
      public.rbac_principal_user(), NEW.user_id, new_org_role_id, public.rbac_scope_org(), NEW.org_id,
      v_granted_by, now(), v_update_reason, true
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Create new app-level bindings for each app (for read/upload/write users)
  IF new_app_role_id IS NOT NULL THEN
    FOR v_app IN SELECT id FROM public.apps WHERE owner_org = NEW.org_id
    LOOP
      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by, granted_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), NEW.user_id, new_app_role_id, public.rbac_scope_app(), NEW.org_id, v_app.id,
        v_granted_by, now(), v_update_reason, true
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Handle transition from admin/super_admin to read/upload/write:
  -- Need to also delete any old org_member binding that might exist
  IF OLD.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) AND NEW.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN
    -- No additional cleanup needed, old org-level binding already deleted above
    NULL;
  END IF;

  -- Handle transition from read/upload/write to admin/super_admin:
  -- Need to delete the org_member binding
  IF OLD.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) AND NEW.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) THEN
    IF org_member_role_id IS NOT NULL THEN
      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = NEW.user_id
        AND scope_type = public.rbac_scope_org()
        AND org_id = NEW.org_id
        AND role_id = org_member_role_id;
    END IF;

    -- Also delete any remaining app-level bindings
    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_app()
      AND org_id = NEW.org_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_org_user_role_binding_on_update"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."sync_org_user_role_binding_on_update"() IS
  'Automatically updates role_bindings entries when org_users.user_right is modified, ensuring both systems stay in sync. Handles transitions between admin roles and member roles.';

-- Create trigger to sync org_users updates to role_bindings
DROP TRIGGER IF EXISTS sync_org_user_role_binding_on_update ON public.org_users;
CREATE TRIGGER sync_org_user_role_binding_on_update
AFTER UPDATE OF user_right ON public.org_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_org_user_role_binding_on_update();

COMMENT ON TRIGGER sync_org_user_role_binding_on_update ON public.org_users IS
  'Ensures role_bindings are updated automatically when org_users permissions are changed.';

-- =============================================================================
-- Enriched role_bindings view for the admin interface
-- =============================================================================

-- Helper function to check if a user is an org admin (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_user_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.org_id = p_org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name IN (public.rbac_role_platform_super_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
$$;

COMMENT ON FUNCTION public.is_user_org_admin(uuid, uuid) IS
  'Checks whether a user has an admin role in an organization (bypasses RLS to avoid recursion).';

-- Helper function to check if a user is an app admin (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_user_app_admin(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
      AND r.name IN (public.rbac_role_app_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin(), public.rbac_role_platform_super_admin())
  );
$$;

COMMENT ON FUNCTION public.is_user_app_admin(uuid, uuid) IS
  'Checks whether a user has an admin role for an app (bypasses RLS to avoid recursion).';

-- Helper function to check if a user has a role in an app (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.user_has_role_in_app(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    SELECT owner_org INTO v_org_id
    FROM public.apps
    WHERE id = p_app_id
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
  );
END;
$$;

COMMENT ON FUNCTION public.user_has_role_in_app(uuid, uuid) IS
  'Checks whether a user has a role in an app (bypasses RLS to avoid recursion).';

-- Helper function to check if a user has app.update_user_roles permission
CREATE OR REPLACE FUNCTION public.user_has_app_update_user_roles(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_app_id_varchar text;
  v_org_id uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Fetch app_id varchar and org_id from apps table
  SELECT app_id, owner_org INTO v_app_id_varchar, v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_app_id_varchar IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- Use rbac_has_permission to check the permission
  RETURN public.rbac_has_permission(
    public.rbac_principal_user(),
    p_user_id,
    public.rbac_perm_app_update_user_roles(),
    v_org_id,
    v_app_id_varchar,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) IS
  'Checks whether a user has app.update_user_roles permission (bypasses RLS to avoid recursion).';

REVOKE ALL ON FUNCTION public.user_has_role_in_app(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_role_in_app(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_app(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_app(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_app_update_user_roles(uuid, uuid) TO service_role;

-- Policy SELECT: check admin rights or role in the app
CREATE POLICY "Allow viewing role bindings with permission"
ON public.role_bindings
FOR SELECT
TO authenticated
USING (
  -- Org admins can see all bindings in their org
  public.is_user_org_admin(auth.uid(), org_id)
  OR
  -- App admins can see bindings for their apps
  (scope_type = public.rbac_scope_app() AND public.is_user_app_admin(auth.uid(), app_id))
  OR
  -- Users with a role in the app can see other app members
  (scope_type = public.rbac_scope_app() AND app_id IS NOT NULL AND public.user_has_role_in_app(auth.uid(), app_id))
);

COMMENT ON POLICY "Allow viewing role bindings with permission" ON public.role_bindings IS
  'Allows viewing role bindings if the user is admin or has a role in the app.';

-- Policy DELETE: use helper functions to avoid recursion
CREATE POLICY "Allow admins to delete manageable role bindings"
ON public.role_bindings
FOR DELETE
TO authenticated
USING (
  -- Users with app.update_user_roles can delete bindings for the app
  (scope_type = public.rbac_scope_app() AND public.user_has_app_update_user_roles(auth.uid(), app_id))
  OR
  -- Users can remove themselves from an app
  (scope_type = public.rbac_scope_app() AND principal_type = public.rbac_principal_user() AND principal_id = auth.uid())
);

COMMENT ON POLICY "Allow admins to delete manageable role bindings" ON public.role_bindings IS
  'Allows users with app.update_user_roles permission and the user themselves to delete role bindings.';

-- =============================================================================
-- RPCs for RBAC Member Management
-- =============================================================================

-- Function to get org members with their RBAC roles
CREATE OR REPLACE FUNCTION "public"."get_org_members_rbac"(p_org_id uuid)
RETURNS TABLE (
  user_id uuid,
  email character varying,
  image_url character varying,
  role_name text,
  role_id uuid,
  binding_id uuid,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has permission to view org members
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  -- Return org members with their RBAC roles
  RETURN QUERY
  SELECT
    u.id as user_id,
    u.email,
    u.image_url,
    r.name as role_name,
    rb.role_id,
    rb.id as binding_id,
    rb.granted_at
  FROM public.users u
  INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE r.scope_type = public.rbac_scope_org() AND r.name LIKE 'org_%'
  ORDER BY
    CASE r.name
      WHEN public.rbac_role_org_super_admin() THEN 1
      WHEN public.rbac_role_org_admin() THEN 2
      WHEN public.rbac_role_org_billing_admin() THEN 3
      WHEN public.rbac_role_org_member() THEN 4
      ELSE 5
    END,
    u.email;
END;
$$;

ALTER FUNCTION "public"."get_org_members_rbac"(uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_org_members_rbac"(uuid) TO "authenticated";

COMMENT ON FUNCTION "public"."get_org_members_rbac"(uuid) IS
  'Returns organization members with their RBAC roles. Requires org.read permission.';

-- Function to update an org member's role
CREATE OR REPLACE FUNCTION "public"."update_org_member_role"(
  p_org_id uuid,
  p_user_id uuid,
  p_new_role_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_role_id uuid;
  v_existing_binding_id uuid;
  v_org_created_by uuid;
  v_role_family text;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent changing the org owner's role
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Validate the new role exists and is an org-level role
  SELECT r.id, r.scope_type INTO v_new_role_id, v_role_family
  FROM public.roles r
  WHERE r.name = p_new_role_name
  LIMIT 1;

  IF v_new_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF v_role_family != public.rbac_scope_org() THEN
    RAISE EXCEPTION 'ROLE_MUST_BE_ORG_LEVEL';
  END IF;

  -- Check if changing from super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 AND p_new_role_name != public.rbac_role_org_super_admin() THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
    AND r.scope_type = public.rbac_scope_org()
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  -- Create new role binding
  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    app_id,
    channel_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  ) VALUES (
    public.rbac_principal_user(),
    p_user_id,
    v_new_role_id,
    public.rbac_scope_org(),
    p_org_id,
    NULL,
    NULL,
    auth.uid(),
    NOW(),
    'Role updated via update_org_member_role',
    true
  );

  RETURN 'OK';
END;
$$;

-- Function to delete an org member's role with RBAC constraints
CREATE OR REPLACE FUNCTION "public"."delete_org_member_role"(
  p_org_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_binding_id uuid;
  v_org_created_by uuid;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent removing the org owner
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Check if removing a super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
    AND r.scope_type = public.rbac_scope_org()
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION "public"."delete_org_member_role"(uuid, uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."delete_org_member_role"(uuid, uuid) TO "authenticated";

COMMENT ON FUNCTION "public"."delete_org_member_role"(uuid, uuid) IS
  'Deletes an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';


ALTER FUNCTION "public"."update_org_member_role"(uuid, uuid, text) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_org_member_role"(uuid, uuid, text) TO "authenticated";

COMMENT ON FUNCTION "public"."update_org_member_role"(uuid, uuid, text) IS
  'Updates an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';

-- =====================================================
-- Migration: Replace role_bindings_view with secure RPCs
-- =====================================================

-- Function to get app access (replaces role_bindings_view for AccessTable)
CREATE OR REPLACE FUNCTION "public"."get_app_access_rbac"(p_app_id uuid)
RETURNS TABLE (
  id uuid,
  principal_type text,
  principal_id uuid,
  principal_name text,
  role_id uuid,
  role_name text,
  role_description text,
  granted_at timestamptz,
  granted_by uuid,
  expires_at timestamptz,
  reason text,
  is_direct boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_app_id_string text;
BEGIN
  -- Get org_id and app_id string from app
  SELECT a.owner_org, a.app_id INTO v_org_id, v_app_id_string
  FROM public.apps a
  WHERE a.id = p_app_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'APP_NOT_FOUND';
  END IF;

  -- Check if user has permission to view app access
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_app_read(), auth.uid(), v_org_id, v_app_id_string, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_ACCESS';
  END IF;

  -- Return app access with enriched data
  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name
      ELSE rb.principal_id::text
    END as principal_name,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.scope_type = public.rbac_scope_app()
    AND rb.app_id = p_app_id
  ORDER BY rb.granted_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_app_access_rbac"(uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_app_access_rbac"(uuid) TO "authenticated";

COMMENT ON FUNCTION "public"."get_app_access_rbac"(uuid) IS
  'Retrieves all access bindings for an app with permission checks. Requires app.read permission.';

CREATE OR REPLACE FUNCTION "public"."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid)
RETURNS TABLE (
  id uuid,
  principal_type text,
  principal_id uuid,
  role_id uuid,
  role_name text,
  role_description text,
  scope_type text,
  org_id uuid,
  app_id uuid,
  channel_id uuid,
  granted_at timestamptz,
  granted_by uuid,
  expires_at timestamptz,
  reason text,
  is_direct boolean,
  principal_name text,
  user_email text,
  group_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user has permission to view org or if it's their own bindings
  IF auth.uid() != p_user_id AND NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL::text, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  -- Return user's org bindings with enriched data
  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.scope_type,
    rb.org_id,
    rb.app_id,
    rb.channel_id,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email::text
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name::text
      ELSE rb.principal_id::text
    END as principal_name,
    u.email::text as user_email,
    g.name::text as group_name
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.org_id = p_org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = p_user_id
  ORDER BY rb.granted_at DESC;
END;
$$;


-- =============================================================================
-- rbac_check_permission_direct: Check RBAC permission with automatic legacy fallback
-- =============================================================================
-- This function is the primary entry point for permission checks from application code.
-- It routes between RBAC and legacy systems based on the org's feature flag.
--
-- When RBAC is enabled: Uses rbac_has_permission directly with the provided permission key
-- When RBAC is disabled: Maps the permission to a legacy min_right and uses check_min_rights_legacy
--
-- Parameters:
--   p_permission_key: RBAC permission (e.g., public.rbac_perm_app_upload_bundle(), public.rbac_perm_channel_promote_bundle())
--   p_user_id: The user to check permissions for
--   p_org_id: Organization ID (can be NULL if derivable from app/channel)
--   p_app_id: App ID (varchar, e.g., 'com.example.app')
--   p_channel_id: Channel ID (bigint)
--   p_apikey: Optional API key string for apikey-based permission checks

CREATE OR REPLACE FUNCTION public.rbac_check_permission_direct(
  p_permission_key text,
  p_user_id uuid,
  p_org_id uuid,
  p_app_id character varying,
  p_channel_id bigint,
  p_apikey text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_allowed boolean := false;
  v_use_rbac boolean;
  v_effective_org_id uuid := p_org_id;
  v_legacy_right public.user_min_right;
  v_apikey_principal uuid;
BEGIN
  -- Validate permission key
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    PERFORM public.pg_log('deny: RBAC_CHECK_PERM_NO_KEY', jsonb_build_object('user_id', p_user_id));
    RETURN false;
  END IF;

  -- Derive org from app/channel when not provided
  IF v_effective_org_id IS NULL AND p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;
  END IF;

  IF v_effective_org_id IS NULL AND p_channel_id IS NOT NULL THEN
    SELECT owner_org INTO v_effective_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;
  END IF;

  -- Check if RBAC is enabled for this org
  v_use_rbac := public.rbac_is_enabled_for_org(v_effective_org_id);

  IF v_use_rbac THEN
    -- RBAC path: Check user permission directly
    IF p_user_id IS NOT NULL THEN
      v_allowed := public.rbac_has_permission(public.rbac_principal_user(), p_user_id, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
    END IF;

    -- If user doesn't have permission, check apikey permission
    IF NOT v_allowed AND p_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal
      FROM public.apikeys
      WHERE key = p_apikey
      LIMIT 1;

      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission(public.rbac_principal_apikey(), v_apikey_principal, p_permission_key, v_effective_org_id, p_app_id, p_channel_id);
      END IF;
    END IF;

    IF NOT v_allowed THEN
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_DIRECT', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id,
        'org_id', v_effective_org_id,
        'app_id', p_app_id,
        'channel_id', p_channel_id,
        'has_apikey', p_apikey IS NOT NULL
      ));
    END IF;

    RETURN v_allowed;
  ELSE
    -- Legacy path: Map permission to min_right and use legacy check
    -- Determine scope from permission prefix
    -- Map permission to legacy right using reverse lookup
    v_legacy_right := public.rbac_legacy_right_for_permission(p_permission_key);

    IF v_legacy_right IS NULL THEN
      -- Unknown permission in legacy mode, deny by default
      PERFORM public.pg_log('deny: RBAC_CHECK_PERM_UNKNOWN_LEGACY', jsonb_build_object(
        'permission', p_permission_key,
        'user_id', p_user_id
      ));
      RETURN false;
    END IF;

    -- Use appropriate legacy check based on context
    IF p_apikey IS NOT NULL AND p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_apikey(p_app_id, v_legacy_right, p_user_id, p_apikey);
    ELSIF p_app_id IS NOT NULL THEN
      RETURN public.has_app_right_userid(p_app_id, v_legacy_right, p_user_id);
    ELSE
      RETURN public.check_min_rights_legacy(v_legacy_right, p_user_id, v_effective_org_id, p_app_id, p_channel_id);
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) IS
  'Direct RBAC permission check with automatic legacy fallback based on org feature flag. Use this from application code for explicit permission checks.';

-- =============================================================================
-- rbac_check_permission: Public wrapper for authenticated users
-- =============================================================================
-- Uses auth.uid() and delegates to rbac_check_permission_direct.

CREATE OR REPLACE FUNCTION public.rbac_check_permission(
  p_permission_key text,
  p_org_id uuid DEFAULT NULL,
  p_app_id character varying DEFAULT NULL,
  p_channel_id bigint DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint) IS
  'Public RBAC permission check for authenticated users. Uses auth.uid() and delegates to rbac_check_permission_direct.';

-- =============================================================================
-- rbac_legacy_right_for_permission: Reverse mapping from permission to legacy min_right
-- =============================================================================
-- This is the inverse of rbac_permission_for_legacy, used when we need to fall back
-- to legacy checks but have a permission key.

CREATE OR REPLACE FUNCTION public.rbac_legacy_right_for_permission(
  p_permission_key text
) RETURNS public.user_min_right
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
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

COMMENT ON FUNCTION public.rbac_legacy_right_for_permission(text) IS
  'Maps RBAC permission keys to legacy user_min_right values for fallback checks.';

-- Grant execute permissions for new functions
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission_direct(text, uuid, uuid, character varying, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rbac_check_permission(text, uuid, character varying, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_permission(text) TO service_role;

-- 17) Update transfer_app to use RBAC
CREATE OR REPLACE FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), v_old_org_id, p_app_id, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_OLD_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the source organization)';
  END IF;

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), p_new_org_id, NULL::character varying, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_NEW_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the destination organization)';
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  UPDATE public.apps
  SET
      owner_org = p_new_org_id,
      updated_at = now(),
      transfer_history = COALESCE(transfer_history, '{}') || jsonb_build_object(
          'transferred_at', now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )::jsonb
  WHERE app_id = p_app_id;

  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

END;
$$;

COMMENT ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") IS 'Transfers an app and all its related data to a new organization. Requires app.transfer permission on both source and destination organizations.';
