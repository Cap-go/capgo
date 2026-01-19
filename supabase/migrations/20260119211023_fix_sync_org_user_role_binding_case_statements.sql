-- Fix sync_org_user_role_binding_on_update function to handle all user_right enum values
-- This addresses the "case not found" error by adding ELSE clauses to CASE statements

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

COMMENT ON FUNCTION "public"."sync_org_user_role_binding_on_update"() IS
  'Automatically updates role_bindings entries when org_users.user_right is modified, ensuring both systems stay in sync. Handles transitions between admin roles and member roles. Includes handling for invite roles which do not create role_bindings.';
