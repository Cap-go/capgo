-- Phase 1 RBAC: Migration utility to convert org_users to role_bindings
-- This migration provides a function to migrate existing org_users records to the new RBAC system.
-- It does NOT automatically migrate data; it must be called explicitly per org to opt-in to RBAC.

-- Migration function: converts org_users records to role_bindings for a specific org
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
  v_role_name text;
  v_role_id uuid;
  v_scope_type text;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_binding_id uuid;
  v_migrated_count int := 0;
  v_skipped_count int := 0;
  v_error_count int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  -- Use provided granted_by or find org owner
  IF p_granted_by IS NULL THEN
    SELECT created_by INTO v_granted_by FROM public.orgs WHERE id = p_org_id LIMIT 1;
    IF v_granted_by IS NULL THEN
      -- Fallback: use first admin user in org
      SELECT user_id INTO v_granted_by
      FROM public.org_users
      WHERE org_id = p_org_id
        AND user_right >= 'admin'::public.user_min_right
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
      -- Get suggested role name using our hint function
      v_role_name := public.rbac_legacy_role_hint(
        v_org_user.user_right,
        v_org_user.app_id,
        v_org_user.channel_id
      );

      -- Skip if no suitable role (e.g., read-only at app/channel level)
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
        v_scope_type := 'channel';
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
        v_scope_type := 'app';
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
        v_scope_type := 'org';
        v_app_uuid := NULL;
        v_channel_uuid := NULL;
      END IF;

      -- Check if binding already exists (idempotency)
      SELECT id INTO v_binding_id FROM public.role_bindings
      WHERE principal_type = 'user'
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
        'user',
        v_org_user.user_id,
        v_role_id,
        v_scope_type,
        p_org_id,
        v_app_uuid,
        v_channel_uuid,
        v_granted_by,
        now(),
        'Migrated from org_users (legacy)',
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
      WHEN ou.channel_id IS NOT NULL THEN 'channel'
      WHEN ou.app_id IS NOT NULL THEN 'app'
      ELSE 'org'
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
BEGIN
  -- Delete all role_bindings that were migrated from org_users
  DELETE FROM public.role_bindings
  WHERE org_id = p_org_id
    AND reason = 'Migrated from org_users (legacy)'
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
