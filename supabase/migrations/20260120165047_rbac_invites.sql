-- RBAC-native invite support

ALTER TABLE public.tmp_users
ADD COLUMN IF NOT EXISTS rbac_role_name text;

ALTER TABLE public.org_users
ADD COLUMN IF NOT EXISTS rbac_role_name text;

-- Map RBAC org roles to legacy user_min_right for compatibility paths
CREATE OR REPLACE FUNCTION public.rbac_legacy_right_for_org_role(
    p_role_name text
)
RETURNS public.user_min_right
LANGUAGE plpgsql
SET search_path = ''
IMMUTABLE AS $$
BEGIN
  CASE p_role_name
    WHEN public.rbac_role_org_super_admin() THEN RETURN public.rbac_right_super_admin();
    WHEN public.rbac_role_org_admin() THEN RETURN public.rbac_right_admin();
    WHEN public.rbac_role_org_billing_admin() THEN RETURN public.rbac_right_read();
    WHEN public.rbac_role_org_member() THEN RETURN public.rbac_right_read();
    ELSE RETURN public.rbac_right_read();
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.rbac_legacy_right_for_org_role(text) IS
$$
Maps RBAC org role names to legacy user_min_right values for compatibility with
legacy tables and RLS.
$$;

ALTER FUNCTION public.rbac_legacy_right_for_org_role(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_org_role(
    text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_legacy_right_for_org_role(
    text
) TO service_role;

-- RBAC-aware invite lookup (returns RBAC role name when available)
DROP FUNCTION IF EXISTS public.get_invite_by_magic_lookup(text);

CREATE OR REPLACE FUNCTION public.get_invite_by_magic_lookup(lookup text)
RETURNS TABLE (
    org_name text,
    org_logo text,
    role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.name AS org_name,
    o.logo AS org_logo,
    COALESCE(tmp.rbac_role_name, tmp.role::text) AS role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
    AND tmp.cancelled_at IS NULL
    AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;

ALTER FUNCTION public.get_invite_by_magic_lookup(text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_invite_by_magic_lookup(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invite_by_magic_lookup(
    text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_by_magic_lookup(text) TO anon;

-- RBAC-native invite for existing users (keeps legacy invite flow)
CREATE OR REPLACE FUNCTION public.invite_user_to_org_rbac(
    email varchar,
    org_id uuid,
    role_name text
) RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  role_id uuid;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
  api_key_text text;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org_rbac.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  IF NOT public.rbac_is_enabled_for_org(invite_user_to_org_rbac.org_id) THEN
    RETURN 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = invite_user_to_org_rbac.role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;

  IF invite_user_to_org_rbac.role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(invite_user_to_org_rbac.role_name);
  invite_right := public.transform_role_to_invite(legacy_right);

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right, rbac_role_name)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_right, invite_user_to_org_rbac.role_name);
      RETURN 'OK';
    END IF;
  ELSE
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org_rbac.email
      AND public.tmp_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_org_rbac(varchar, uuid, text) IS
$$
Invite a user to an organization using RBAC roles while preserving legacy invite
flow.
$$;

ALTER FUNCTION public.invite_user_to_org_rbac(
    varchar, uuid, text
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.invite_user_to_org_rbac(
    varchar, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_org_rbac(
    varchar, uuid, text
) TO service_role;

-- Update invite role for existing-user invitations (RBAC)
CREATE OR REPLACE FUNCTION public.update_org_invite_role_rbac(
    p_org_id uuid,
    p_user_id uuid,
    p_new_role_name text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  role_id uuid;
  legacy_right public.user_min_right;
  invite_right public.user_min_right;
BEGIN
  IF NOT public.rbac_is_enabled_for_org(p_org_id) THEN
    RAISE EXCEPTION 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), p_org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(p_new_role_name);
  invite_right := public.transform_role_to_invite(legacy_right);

  UPDATE public.org_users
  SET user_right = invite_right,
      rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND user_right::text LIKE 'invite_%';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(
    uuid, uuid, text
) TO service_role;

-- Update invite role for new-user invitations (RBAC)
CREATE OR REPLACE FUNCTION public.update_tmp_invite_role_rbac(
    p_org_id uuid,
    p_email text,
    p_new_role_name text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  role_id uuid;
  legacy_right public.user_min_right;
BEGIN
  IF NOT public.rbac_is_enabled_for_org(p_org_id) THEN
    RAISE EXCEPTION 'RBAC_NOT_ENABLED';
  END IF;

  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), p_org_id, NULL, NULL) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  legacy_right := public.rbac_legacy_right_for_org_role(p_new_role_name);

  UPDATE public.tmp_users
  SET role = legacy_right,
      rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND email = p_email
    AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(
    uuid, text, text
) TO service_role;

-- RBAC-aware accept invitation for existing users
CREATE OR REPLACE FUNCTION public.accept_invitation_to_org(org_id uuid)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  invite record;
  use_rbac boolean;
  legacy_right public.user_min_right;
  role_id uuid;
BEGIN
  SELECT org_users.* FROM public.org_users
  INTO invite
  WHERE org_users.org_id = accept_invitation_to_org.org_id
    AND (SELECT auth.uid()) = org_users.user_id;

  IF invite IS NULL THEN
    RETURN 'NO_INVITE';
  END IF;

  IF NOT (invite.user_right::varchar ILIKE 'invite_' || '%') THEN
    RETURN 'INVALID_ROLE';
  END IF;

  use_rbac := public.rbac_is_enabled_for_org(invite.org_id);

  IF use_rbac AND invite.rbac_role_name IS NOT NULL THEN
    legacy_right := public.rbac_legacy_right_for_org_role(invite.rbac_role_name);

    UPDATE public.org_users
    SET user_right = legacy_right,
        updated_at = CURRENT_TIMESTAMP
    WHERE org_users.id = invite.id;

    SELECT id INTO role_id FROM public.roles
    WHERE name = invite.rbac_role_name
      AND scope_type = public.rbac_scope_org()
    LIMIT 1;

    IF role_id IS NULL THEN
      RETURN 'ROLE_NOT_FOUND';
    END IF;

    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = invite.user_id
      AND scope_type = public.rbac_scope_org()
      AND role_bindings.org_id = invite.org_id;

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
      invite.user_id,
      role_id,
      public.rbac_scope_org(),
      invite.org_id,
      NULL,
      NULL,
      auth.uid(),
      now(),
      'Accepted invitation',
      true
    ) ON CONFLICT DO NOTHING;

    RETURN 'OK';
  END IF;

  UPDATE public.org_users
  SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::public.user_min_right
  WHERE org_users.id = invite.id;

  RETURN 'OK';
END;
$$;

ALTER FUNCTION public.accept_invitation_to_org(uuid) OWNER TO postgres;

-- Sync org_users inserts to role_bindings, skipping RBAC-managed rows
CREATE OR REPLACE FUNCTION public.sync_org_user_to_role_binding()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
  v_use_rbac boolean;
BEGIN
  SELECT use_new_rbac INTO v_use_rbac FROM public.orgs WHERE id = NEW.org_id;
  IF v_use_rbac AND NEW.rbac_role_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

ALTER FUNCTION public.sync_org_user_to_role_binding() OWNER TO postgres;

-- Sync org_users updates to role_bindings, skipping RBAC-managed rows
CREATE OR REPLACE FUNCTION public.sync_org_user_role_binding_on_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
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
  v_use_rbac boolean;
BEGIN
  SELECT use_new_rbac INTO v_use_rbac FROM public.orgs WHERE id = NEW.org_id;
  IF v_use_rbac AND (NEW.rbac_role_name IS NOT NULL OR OLD.rbac_role_name IS NOT NULL) THEN
    RETURN NEW;
  END IF;

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
  IF OLD.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin())
    AND NEW.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write()) THEN
    NULL;
  END IF;

  -- Handle transition from read/upload/write to admin/super_admin:
  IF OLD.user_right IN (public.rbac_right_read(), public.rbac_right_upload(), public.rbac_right_write())
    AND NEW.user_right IN (public.rbac_right_super_admin(), public.rbac_right_admin()) THEN
    IF org_member_role_id IS NOT NULL THEN
      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = NEW.user_id
        AND scope_type = public.rbac_scope_org()
        AND org_id = NEW.org_id
        AND role_id = org_member_role_id;
    END IF;

    DELETE FROM public.role_bindings
    WHERE principal_type = public.rbac_principal_user()
      AND principal_id = NEW.user_id
      AND scope_type = public.rbac_scope_app()
      AND org_id = NEW.org_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_org_user_role_binding_on_update() OWNER TO postgres;

-- RBAC-aware org members list (includes pending invites)
DROP FUNCTION IF EXISTS public.get_org_members_rbac(uuid);

CREATE OR REPLACE FUNCTION public.get_org_members_rbac(p_org_id uuid)
RETURNS TABLE (
    user_id uuid,
    email character varying,
    image_url character varying,
    role_name text,
    role_id uuid,
    binding_id uuid,
    granted_at timestamptz,
    is_invite boolean,
    is_tmp boolean,
    org_user_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  RETURN QUERY
  WITH rbac_members AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      r.name AS role_name,
      rb.role_id,
      rb.id AS binding_id,
      rb.granted_at,
      false AS is_invite,
      false AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.users u
    INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE r.scope_type = public.rbac_scope_org()
      AND r.name LIKE 'org_%'
  ),
  legacy_invites AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      COALESCE(
        ou.rbac_role_name,
        CASE public.transform_role_to_non_invite(ou.user_right)
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      ou.created_at AS granted_at,
      true AS is_invite,
      false AS is_tmp,
      ou.id AS org_user_id
    FROM public.org_users ou
    INNER JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = p_org_id
      AND ou.user_right::text LIKE 'invite_%'
  ),
  tmp_invites AS (
    SELECT
      tmp.future_uuid AS user_id,
      tmp.email,
      ''::character varying AS image_url,
      COALESCE(
        tmp.rbac_role_name,
        CASE tmp.role
          WHEN public.rbac_right_super_admin() THEN public.rbac_role_org_super_admin()
          WHEN public.rbac_right_admin() THEN public.rbac_role_org_admin()
          ELSE public.rbac_role_org_member()
        END
      ) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      tmp.created_at AS granted_at,
      true AS is_invite,
      true AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.tmp_users tmp
    WHERE tmp.org_id = p_org_id
      AND tmp.cancelled_at IS NULL
      AND tmp.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days')
  )
  SELECT *
  FROM (
    SELECT * FROM rbac_members
    UNION ALL
    SELECT * FROM legacy_invites
    UNION ALL
    SELECT * FROM tmp_invites
  ) AS combined
  ORDER BY
    combined.is_invite,
    CASE combined.role_name
      WHEN public.rbac_role_org_super_admin() THEN 1
      WHEN public.rbac_role_org_admin() THEN 2
      WHEN public.rbac_role_org_billing_admin() THEN 3
      WHEN public.rbac_role_org_member() THEN 4
      ELSE 5
    END,
    combined.email;
END;
$$;

ALTER FUNCTION public.get_org_members_rbac(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_org_members_rbac(uuid) IS
$$
Returns organization members and pending invites with their RBAC roles. Requires
org.read permission.
$$;

-- RBAC-aware org list with RBAC roles when enabled
DROP FUNCTION IF EXISTS public.get_orgs_v7(uuid);

CREATE FUNCTION public.get_orgs_v7(userid uuid)
RETURNS TABLE (
    gid uuid,
    created_by uuid,
    logo text,
    name text,
    role character varying,
    paying boolean,
    trial_left integer,
    can_use_more boolean,
    is_canceled boolean,
    app_count bigint,
    subscription_start timestamptz,
    subscription_end timestamptz,
    management_email text,
    is_yearly boolean,
    stats_updated_at timestamp without time zone,
    next_stats_update_at timestamptz,
    credit_available numeric,
    credit_total numeric,
    credit_next_expiration timestamptz,
    enforcing_2fa boolean,
    "2fa_has_access" boolean,
    enforce_hashed_api_keys boolean,
    password_policy_config jsonb,
    password_has_access boolean,
    require_apikey_expiration boolean,
    max_apikey_expiration_days integer,
    enforce_encrypted_bundles boolean,
    required_encryption_key character varying,
    use_new_rbac boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) as cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  rbac_roles AS (
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION ALL
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  rbac_org_roles AS (
    SELECT org_id, (ARRAY_AGG(rbac_roles.name ORDER BY rbac_roles.priority_rank DESC))[1] AS role_name
    FROM rbac_roles
    GROUP BY org_id
  ),
  user_orgs AS (
    SELECT ou.org_id
    FROM public.org_users ou
    WHERE ou.user_id = userid
    UNION
    SELECT rbac_org_roles.org_id
    FROM rbac_org_roles
  ),
  -- Compute next stats update info for all paying orgs at once
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
        AND si.subscription_anchor_end > NOW())
      OR si.trial_at > NOW()
    )
  ),
  -- Calculate current billing cycle for each org
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > NOW() - date_trunc('MONTH', NOW())
        THEN date_trunc('MONTH', NOW() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', NOW())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  ),
  -- Calculate password policy access status for user/org combinations
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    CASE
      WHEN o.use_new_rbac AND ou.user_right::text LIKE 'invite_%' THEN ou.user_right::varchar
      WHEN o.use_new_rbac THEN COALESCE(ror.role_name, ou.rbac_role_name, ou.user_right::varchar)
      ELSE COALESCE(ou.user_right::varchar, ror.role_name)
    END AS role,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - NOW()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.available_credits, 0)
    END AS credit_available,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.total_credits, 0)
    END AS credit_total,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE ucb.next_expiration
    END AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles,
    o.required_encryption_key,
    o.use_new_rbac
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  LEFT JOIN rbac_org_roles ror ON ror.org_id = o.id
  LEFT JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v7(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(uuid) TO service_role;

-- Update wrapper to match updated return type
DROP FUNCTION IF EXISTS public.get_orgs_v7();

CREATE OR REPLACE FUNCTION public.get_orgs_v7()
RETURNS TABLE (
    gid uuid,
    created_by uuid,
    logo text,
    name text,
    role character varying,
    paying boolean,
    trial_left integer,
    can_use_more boolean,
    is_canceled boolean,
    app_count bigint,
    subscription_start timestamptz,
    subscription_end timestamptz,
    management_email text,
    is_yearly boolean,
    stats_updated_at timestamp without time zone,
    next_stats_update_at timestamptz,
    credit_available numeric,
    credit_total numeric,
    credit_next_expiration timestamptz,
    enforcing_2fa boolean,
    "2fa_has_access" boolean,
    enforce_hashed_api_keys boolean,
    password_policy_config jsonb,
    password_has_access boolean,
    require_apikey_expiration boolean,
    max_apikey_expiration_days integer,
    enforce_encrypted_bundles boolean,
    required_encryption_key character varying,
    use_new_rbac boolean
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  user_id := NULL;

  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RAISE EXCEPTION 'API key has expired';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v7(user_id) AS orgs
      WHERE orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  IF user_id IS NULL THEN
    SELECT public.get_identity() INTO user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.get_orgs_v7(user_id);
END;
$$;

ALTER FUNCTION public.get_orgs_v7() OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO service_role;
