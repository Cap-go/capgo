-- Phase 1 RBAC introduction (coexists with legacy org_users rights)
-- Scope: schema objects, seed data for priority roles/perms, feature flags, and helper functions.
-- Notes:
--   * Default behavior remains legacy; RBAC is opt-in via global/org flag.
--   * We do not modify or drop legacy columns. Compatibility helpers are added instead.
--   * Scope identifiers use UUIDs; extra UUID columns are added where the existing schema used non-UUID keys.

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
ALTER TABLE public.apikeys ADD CONSTRAINT apikeys_rbac_id_key UNIQUE (rbac_id);
COMMENT ON COLUMN public.apikeys.rbac_id IS 'Stable UUID to bind RBAC roles to api keys.';

ALTER TABLE public.channels
ADD COLUMN IF NOT EXISTS rbac_id uuid DEFAULT gen_random_uuid();
UPDATE public.channels SET rbac_id = gen_random_uuid() WHERE rbac_id IS NULL;
ALTER TABLE public.channels ALTER COLUMN rbac_id SET NOT NULL;
ALTER TABLE public.channels ADD CONSTRAINT channels_rbac_id_key UNIQUE (rbac_id);
COMMENT ON COLUMN public.channels.rbac_id IS 'Stable UUID to bind RBAC roles to channel scope.';

-- apps.id already exists but was not unique; make it an addressable scope identifier.
ALTER TABLE public.apps
ADD CONSTRAINT apps_id_unique UNIQUE (id);
COMMENT ON COLUMN public.apps.id IS 'UUID scope id for RBAC (app-level roles reference this id).';

-- 2) Core RBAC tables
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'channel')),
  description text,
  is_priority boolean NOT NULL DEFAULT true,
  family_name text NOT NULL,
  priority_rank int NOT NULL DEFAULT 0,
  is_assignable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);
COMMENT ON TABLE public.roles IS 'Canonical RBAC roles. Scope_type indicates the native scope the role is defined for.';

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'channel')),
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
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'group', 'apikey')),
  principal_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'org', 'app', 'channel')),
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  app_id uuid NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  channel_id uuid NULL REFERENCES public.channels(rbac_id) ON DELETE CASCADE,
  family_name text NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  reason text NULL,
  is_direct boolean NOT NULL DEFAULT true,
  CHECK (
    (scope_type = 'platform' AND org_id IS NULL AND app_id IS NULL AND channel_id IS NULL) OR
    (scope_type = 'org' AND org_id IS NOT NULL AND app_id IS NULL AND channel_id IS NULL) OR
    (scope_type = 'app' AND org_id IS NOT NULL AND app_id IS NOT NULL AND channel_id IS NULL) OR
    (scope_type = 'channel' AND org_id IS NOT NULL AND app_id IS NOT NULL AND channel_id IS NOT NULL)
  )
);
COMMENT ON TABLE public.role_bindings IS 'Assign roles to principals at a scope. family_name is duplicated for SSD enforcement.';

-- SSD: only one role per family per scope/principal.
CREATE UNIQUE INDEX role_bindings_platform_family_uniq
  ON public.role_bindings (principal_type, principal_id, family_name)
  WHERE scope_type = 'platform';
CREATE UNIQUE INDEX role_bindings_org_family_uniq
  ON public.role_bindings (principal_type, principal_id, org_id, family_name)
  WHERE scope_type = 'org';
CREATE UNIQUE INDEX role_bindings_app_family_uniq
  ON public.role_bindings (principal_type, principal_id, app_id, family_name)
  WHERE scope_type = 'app';
CREATE UNIQUE INDEX role_bindings_channel_family_uniq
  ON public.role_bindings (principal_type, principal_id, channel_id, family_name)
  WHERE scope_type = 'channel';

CREATE INDEX role_bindings_principal_scope_idx
  ON public.role_bindings (principal_type, principal_id, scope_type, org_id, app_id, channel_id);
CREATE INDEX role_bindings_scope_idx
  ON public.role_bindings (scope_type, org_id, app_id, channel_id);

-- Keep family_name in sync with roles
CREATE OR REPLACE FUNCTION public.role_bindings_set_family_name() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  v_family text;
BEGIN
  SELECT family_name INTO v_family FROM public.roles WHERE id = NEW.role_id;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'role % not found for binding', NEW.role_id;
  END IF;
  NEW.family_name := v_family;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_bindings_family_name_trg ON public.role_bindings;
CREATE TRIGGER role_bindings_family_name_trg
BEFORE INSERT OR UPDATE OF role_id ON public.role_bindings
FOR EACH ROW
EXECUTE FUNCTION public.role_bindings_set_family_name();

-- 3) Seed priority permissions (Phase 1 only)
INSERT INTO public.permissions (key, scope_type, description)
VALUES
  -- Org permissions
  ('org.read', 'org', 'Read org level settings and metadata'),
  ('org.update_settings', 'org', 'Update org configuration/settings'),
  ('org.read_members', 'org', 'Read org membership list'),
  ('org.invite_user', 'org', 'Invite or add members to org'),
  ('org.update_user_roles', 'org', 'Change org/member roles'),
  ('org.read_billing', 'org', 'Read org billing settings'),
  ('org.update_billing', 'org', 'Update org billing settings'),
  ('org.read_invoices', 'org', 'Read invoices'),
  ('org.read_audit', 'org', 'Read org-level audit trail'),
  ('org.read_billing_audit', 'org', 'Read billing/audit details'),
  -- App permissions
  ('app.read', 'app', 'Read app metadata'),
  ('app.update_settings', 'app', 'Update app settings'),
  ('app.read_bundles', 'app', 'Read app bundle metadata'),
  ('app.upload_bundle', 'app', 'Upload a bundle'),
  ('app.delete_bundle', 'app', 'Delete a bundle'),
  ('app.create_channel', 'app', 'Create channels'),
  ('app.delete_channel', 'app', 'Delete channels'),
  ('app.read_channels', 'app', 'List/read channels'),
  ('app.read_logs', 'app', 'Read app logs/metrics'),
  ('app.manage_devices', 'app', 'Manage devices at app scope'),
  ('app.read_devices', 'app', 'Read devices at app scope'),
  ('app.build_native', 'app', 'Trigger native builds'),
  ('app.read_audit', 'app', 'Read app-level audit trail'),
  -- Channel permissions
  ('channel.read', 'channel', 'Read channel metadata'),
  ('channel.update_settings', 'channel', 'Update channel settings'),
  ('channel.delete', 'channel', 'Delete a channel'),
  ('channel.read_history', 'channel', 'Read deploy history'),
  ('channel.promote_bundle', 'channel', 'Promote bundle to channel'),
  ('channel.rollback_bundle', 'channel', 'Rollback bundle on channel'),
  ('channel.manage_forced_devices', 'channel', 'Manage forced devices'),
  ('channel.read_forced_devices', 'channel', 'Read forced devices'),
  ('channel.read_audit', 'channel', 'Read channel-level audit'),
  -- Platform permissions
  ('platform.impersonate_user', 'platform', 'Support/impersonation'),
  ('platform.manage_orgs_any', 'platform', 'Administer any org'),
  ('platform.manage_apps_any', 'platform', 'Administer any app'),
  ('platform.manage_channels_any', 'platform', 'Administer any channel'),
  ('platform.run_maintenance_jobs', 'platform', 'Run maintenance/ops jobs'),
  ('platform.delete_orphan_users', 'platform', 'Delete orphan users'),
  ('platform.read_all_audit', 'platform', 'Read all audit trails'),
  ('platform.db_break_glass', 'platform', 'Emergency direct DB access')
ON CONFLICT (key) DO NOTHING;

-- 4) Seed priority roles
INSERT INTO public.roles (name, scope_type, description, is_priority, family_name, priority_rank, is_assignable, created_by)
VALUES
  ('platform_super_admin', 'platform', 'Full platform control (not assignable to customers)', true, 'platform_base', 100, false, NULL),
  ('org_admin', 'org', 'Full org administration', true, 'org_base', 90, true, NULL),
  ('org_billing_admin', 'org', 'Billing-only administrator for an org', true, 'org_base', 80, true, NULL),
  ('app_admin', 'app', 'Full administration of an app', true, 'app_base', 70, true, NULL),
  ('channel_admin', 'channel', 'Full administration of a channel', true, 'channel_base', 60, true, NULL)
ON CONFLICT (name) DO NOTHING;

-- 5) Attach permissions to roles
-- platform_super_admin: full control over all permissions (operations team only)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON TRUE
WHERE r.name = 'platform_super_admin';

-- org_admin: org management, billing read/update, member/role management, and delegated app/channel control
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'org.read', 'org.update_settings', 'org.read_members', 'org.invite_user', 'org.update_user_roles',
  'org.read_billing', 'org.update_billing', 'org.read_invoices', 'org.read_audit', 'org.read_billing_audit',
  -- app/channel control granted at org scope
  'app.read', 'app.update_settings', 'app.read_bundles', 'app.upload_bundle', 'app.delete_bundle',
  'app.create_channel', 'app.delete_channel', 'app.read_channels', 'app.read_logs', 'app.manage_devices',
  'app.read_devices', 'app.build_native', 'app.read_audit',
  'channel.read', 'channel.update_settings', 'channel.delete', 'channel.read_history',
  'channel.promote_bundle', 'channel.rollback_bundle', 'channel.manage_forced_devices',
  'channel.read_forced_devices', 'channel.read_audit'
)
WHERE r.name = 'org_admin';

-- org_billing_admin: restricted to billing views/updates
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'org.read', 'org.read_billing', 'org.update_billing', 'org.read_invoices', 'org.read_billing_audit'
)
WHERE r.name = 'org_billing_admin';

-- app_admin: full control of app + channels under that app
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'app.read', 'app.update_settings', 'app.read_bundles', 'app.upload_bundle', 'app.delete_bundle',
  'app.create_channel', 'app.delete_channel', 'app.read_channels', 'app.read_logs', 'app.manage_devices',
  'app.read_devices', 'app.build_native', 'app.read_audit',
  'channel.read', 'channel.update_settings', 'channel.delete', 'channel.read_history',
  'channel.promote_bundle', 'channel.rollback_bundle', 'channel.manage_forced_devices',
  'channel.read_forced_devices', 'channel.read_audit'
)
WHERE r.name = 'app_admin';

-- channel_admin: channel-scoped management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'channel.read', 'channel.update_settings', 'channel.delete', 'channel.read_history',
  'channel.promote_bundle', 'channel.rollback_bundle', 'channel.manage_forced_devices',
  'channel.read_forced_devices', 'channel.read_audit'
)
WHERE r.name = 'channel_admin';

-- 6) Role hierarchy (explicit inheritance)
INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = 'org_admin' AND child.name = 'app_admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_hierarchy (parent_role_id, child_role_id)
SELECT parent.id, child.id
FROM public.roles parent, public.roles child
WHERE parent.name = 'app_admin' AND child.name = 'channel_admin'
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
  IF p_scope = 'org' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin') THEN
      RETURN 'org.update_user_roles';
    ELSIF p_min_right IN ('write', 'upload', 'invite_write', 'invite_upload') THEN
      RETURN 'org.update_settings';
    ELSE
      RETURN 'org.read';
    END IF;
  ELSIF p_scope = 'app' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin', 'write', 'invite_write') THEN
      RETURN 'app.update_settings';
    ELSIF p_min_right IN ('upload', 'invite_upload') THEN
      RETURN 'app.upload_bundle';
    ELSE
      RETURN 'app.read';
    END IF;
  ELSIF p_scope = 'channel' THEN
    IF p_min_right IN ('super_admin', 'admin', 'invite_super_admin', 'invite_admin', 'write', 'invite_write') THEN
      RETURN 'channel.update_settings';
    ELSIF p_min_right IN ('upload', 'invite_upload') THEN
      RETURN 'channel.promote_bundle';
    ELSE
      RETURN 'channel.read';
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

  WITH scope_catalog AS (
    SELECT 'platform'::text AS scope_type, NULL::uuid AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id
    UNION ALL
    SELECT 'org', v_org_id, NULL::uuid, NULL::uuid WHERE v_org_id IS NOT NULL
    UNION ALL
    SELECT 'app', v_org_id, v_app_uuid, NULL::uuid WHERE v_app_uuid IS NOT NULL
    UNION ALL
    SELECT 'channel', v_org_id, v_app_uuid, v_channel_uuid WHERE v_channel_uuid IS NOT NULL
  ),
  direct_roles AS (
    SELECT rb.role_id
    FROM scope_catalog s
    JOIN public.role_bindings rb ON rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = 'platform') OR
        (rb.scope_type = 'org' AND rb.org_id = s.org_id) OR
        (rb.scope_type = 'app' AND rb.app_id = s.app_id) OR
        (rb.scope_type = 'channel' AND rb.channel_id = s.channel_id)
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
    JOIN public.role_bindings rb ON rb.principal_type = 'group' AND rb.principal_id = gm.group_id
    WHERE p_principal_type = 'user'
      AND rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = 'org' AND rb.org_id = s.org_id) OR
        (rb.scope_type = 'app' AND rb.app_id = s.app_id) OR
        (rb.scope_type = 'channel' AND rb.channel_id = s.channel_id)
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
    v_scope := 'channel';
  ELSIF app_id IS NOT NULL THEN
    v_scope := 'app';
  ELSE
    v_scope := 'org';
  END IF;

  v_perm := public.rbac_permission_for_legacy(min_right, v_scope);

  IF user_id IS NOT NULL THEN
    v_allowed := public.rbac_has_permission('user', user_id, v_perm, v_effective_org_id, app_id, channel_id);
  END IF;

  -- Also consider apikey principal when RBAC is enabled (API keys can hold roles directly).
  IF NOT v_allowed THEN
    SELECT public.get_apikey_header() INTO v_apikey;
    IF v_apikey IS NOT NULL THEN
      SELECT rbac_id INTO v_apikey_principal FROM public.apikeys WHERE key = v_apikey LIMIT 1;
      IF v_apikey_principal IS NOT NULL THEN
        v_allowed := public.rbac_has_permission('apikey', v_apikey_principal, v_perm, v_effective_org_id, app_id, channel_id);
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
  appid character varying,
  right public.user_min_right
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
BEGIN
  RETURN public.has_app_right_userid(appid, right, (SELECT auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.has_app_right_userid(
  appid character varying,
  right public.user_min_right,
  userid uuid
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
  allowed boolean;
BEGIN
  org_id := public.get_user_main_org_id_by_app_id(appid);

  allowed := public.check_min_rights(right, userid, org_id, appid, NULL::bigint);
  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_USERID', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', right::text, 'userid', userid));
  END IF;
  RETURN allowed;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_app_right_apikey(
  appid character varying,
  right public.user_min_right,
  userid uuid,
  apikey text
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
  org_id := public.get_user_main_org_id_by_app_id(appid);
  use_rbac := public.rbac_is_enabled_for_org(org_id);

  SELECT * FROM public.apikeys WHERE key = apikey INTO api_key;
  IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
    IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
      PERFORM public.pg_log('deny: APIKEY_ORG_RESTRICT', jsonb_build_object('org_id', org_id, 'appid', appid));
      RETURN false;
    END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT (appid = ANY(api_key.limited_to_apps)) THEN
      PERFORM public.pg_log('deny: APIKEY_APP_RESTRICT', jsonb_build_object('appid', appid));
      RETURN false;
    END IF;
  END IF;

  IF use_rbac THEN
    perm_key := public.rbac_permission_for_legacy(right, 'app');
    allowed := public.rbac_has_permission('apikey', api_key.rbac_id, perm_key, org_id, appid, NULL::bigint);
  ELSE
    allowed := public.check_min_rights(right, userid, org_id, appid, NULL::bigint);
  END IF;

  IF NOT allowed THEN
    PERFORM public.pg_log('deny: HAS_APP_RIGHT_APIKEY', jsonb_build_object('appid', appid, 'org_id', org_id, 'right', right::text, 'userid', userid, 'rbac', use_rbac));
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
    IF p_user_right >= 'write'::public.user_min_right THEN
      RETURN 'channel_admin';
    END IF;
    RETURN NULL;
  ELSIF p_app_id IS NOT NULL THEN
    IF p_user_right >= 'write'::public.user_min_right THEN
      RETURN 'app_admin';
    END IF;
    RETURN NULL;
  ELSE
    IF p_user_right >= 'admin'::public.user_min_right THEN
      RETURN 'org_admin';
    ELSIF p_user_right = 'read'::public.user_min_right THEN
      RETURN 'org_billing_admin';
    END IF;
    RETURN NULL;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.rbac_legacy_role_hint(public.user_min_right, character varying, bigint) IS 'Heuristic mapping from legacy org_users rows to Phase 1 priority roles (for migration planning only).';

CREATE OR REPLACE VIEW public.legacy_org_user_role_hints AS
SELECT
  ou.id AS org_user_row_id,
  ou.user_id,
  ou.org_id,
  ou.app_id,
  ou.channel_id,
  ou.user_right,
  public.rbac_legacy_role_hint(ou.user_right, ou.app_id, ou.channel_id) AS suggested_role
FROM public.org_users ou;
COMMENT ON VIEW public.legacy_org_user_role_hints IS 'Read-only view to help reconcile legacy rights with new RBAC roles during migration.';
