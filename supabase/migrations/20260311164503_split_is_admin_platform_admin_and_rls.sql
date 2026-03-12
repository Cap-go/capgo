-- Define platform admin detection as the single canonical platform-admin helper
CREATE OR REPLACE FUNCTION public.is_platform_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_platform_admin_from_secret boolean;
  mfa_verified boolean;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb
  FROM vault.decrypted_secrets
  WHERE name = 'admin_users';

  is_platform_admin_from_secret := COALESCE(admin_ids_jsonb ? userid::text, false);

  RETURN is_platform_admin_from_secret;
END;
$$;

ALTER FUNCTION public.is_platform_admin(userid uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.is_platform_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_platform_admin(userid uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM public;
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_platform_admin() TO service_role;

COMMENT ON FUNCTION public.is_platform_admin(
    uuid
) IS 'Checks platform admin status from admin_users and requires MFA.';

-- ---------------------------------------------------------------------------
-- RLS migration:
-- Remove legacy policy-level admin checks by rewriting them to literal false.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policy RECORD;
  v_roles TEXT;
  v_using TEXT;
  v_with_check TEXT;
  v_roles_sql TEXT;
  v_cmd TEXT;
BEGIN
  FOR v_policy IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual LIKE '%is_admin%'
        OR with_check LIKE '%is_admin%'
      )
  LOOP
    v_using := COALESCE(v_policy.qual, '');
    v_with_check := COALESCE(v_policy.with_check, '');
    v_roles_sql := '';

    v_using := replace(v_using, 'public.is_admin(auth_user.uid)', 'false');
    v_using := replace(v_using, 'public.is_admin(auth.uid())', 'false');
    v_using := replace(v_using, '"public"."is_admin"("auth_user"."uid")', 'false');
    v_using := replace(v_using, 'public.is_admin((SELECT auth.uid()))', 'false');
    v_using := replace(v_using, '"public"."is_admin"((SELECT auth.uid()))', 'false');
    v_using := replace(v_using, 'is_admin(auth_user.uid)', 'false');
    v_using := replace(v_using, 'is_admin(auth.uid())', 'false');
    v_using := replace(v_using, 'is_admin((SELECT auth.uid()))', 'false');

    v_with_check := replace(v_with_check, 'public.is_admin(auth_user.uid)', 'false');
    v_with_check := replace(v_with_check, 'public.is_admin(auth.uid())', 'false');
    v_with_check := replace(v_with_check, '"public"."is_admin"("auth_user"."uid")', 'false');
    v_with_check := replace(v_with_check, 'public.is_admin((SELECT auth.uid()))', 'false');
    v_with_check := replace(v_with_check, '"public"."is_admin"((SELECT auth.uid()))', 'false');
    v_with_check := replace(v_with_check, 'is_admin(auth_user.uid)', 'false');
    v_with_check := replace(v_with_check, 'is_admin(auth.uid())', 'false');
    v_with_check := replace(v_with_check, 'is_admin((SELECT auth.uid()))', 'false');

    IF v_using = v_policy.qual AND v_with_check = COALESCE(v_policy.with_check, '') THEN
      CONTINUE;
    END IF;

    IF array_length(v_policy.roles, 1) > 0 THEN
      SELECT string_agg(format('%I', policy_role), ', ')
      INTO v_roles
      FROM unnest(v_policy.roles) AS x(policy_role);
      v_roles_sql := format(' TO %s', v_roles);
    END IF;

    v_using := NULLIF(BTRIM(v_using), '');
    v_with_check := NULLIF(BTRIM(v_with_check), '');

    IF v_using IS NULL THEN
      v_using := 'true';
    END IF;

    IF v_policy.with_check IS NOT NULL AND v_with_check IS NULL THEN
      v_with_check := 'true';
    END IF;

    IF v_policy.cmd = 'INSERT' THEN
      IF v_with_check IS NULL THEN
        v_with_check := 'true';
      END IF;
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' WITH CHECK (%s)', v_with_check);
    ELSIF v_policy.with_check IS NOT NULL AND v_policy.cmd IN ('UPDATE', 'ALL') THEN
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s) WITH CHECK (%s)', v_using, v_with_check);
    ELSIF v_policy.cmd = 'SELECT' OR v_policy.cmd = 'DELETE' OR v_policy.cmd = 'UPDATE' THEN
      IF v_using IS NULL THEN
        v_using := 'true';
      END IF;
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s)', v_using);
    ELSE
      v_cmd := format(
        'ALTER POLICY %I ON %I.%I',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename
      );
      v_cmd := v_cmd || v_roles_sql || format(' USING (%s)', v_using);
    END IF;

    EXECUTE v_cmd;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Lock rbac_settings behind deny-all RLS. Only internal SECURITY DEFINER
-- helpers should read it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.rbac_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbac_settings_read_authenticated ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_admin_all ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_select ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_insert ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_update ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_delete ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_select ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_insert ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_update ON public.rbac_settings;
DROP POLICY IF EXISTS rbac_settings_no_delete ON public.rbac_settings;

CREATE POLICY rbac_settings_no_select ON public.rbac_settings
FOR SELECT
TO public
USING (false);

CREATE POLICY rbac_settings_no_insert ON public.rbac_settings
FOR INSERT
TO public
WITH CHECK (false);

CREATE POLICY rbac_settings_no_update ON public.rbac_settings
FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY rbac_settings_no_delete ON public.rbac_settings
FOR DELETE
TO public
USING (false);

-- ---------------------------------------------------------------------------
-- Remove the deprecated platform RBAC scope from live data and prevent new
-- platform-scoped roles, permissions, and bindings.
-- ---------------------------------------------------------------------------
DELETE FROM public.role_bindings
WHERE scope_type = public.rbac_scope_platform();

DELETE FROM public.permissions
WHERE scope_type = public.rbac_scope_platform();

DELETE FROM public.roles
WHERE scope_type = public.rbac_scope_platform();

DROP INDEX IF EXISTS public.role_bindings_platform_scope_uniq;

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_scope_type_no_platform;
ALTER TABLE public.permissions
DROP CONSTRAINT IF EXISTS permissions_scope_type_no_platform;
ALTER TABLE public.role_bindings
DROP CONSTRAINT IF EXISTS role_bindings_scope_type_no_platform;

ALTER TABLE public.roles
ADD CONSTRAINT roles_scope_type_no_platform
CHECK (scope_type <> public.rbac_scope_platform());

ALTER TABLE public.permissions
ADD CONSTRAINT permissions_scope_type_no_platform
CHECK (scope_type <> public.rbac_scope_platform());

ALTER TABLE public.role_bindings
ADD CONSTRAINT role_bindings_scope_type_no_platform
CHECK (scope_type <> public.rbac_scope_platform());

CREATE OR REPLACE FUNCTION public.rbac_has_permission(
    p_principal_type text,
    p_principal_id uuid,
    p_permission_key text,
    p_org_id uuid,
    p_app_id character varying,
    p_channel_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org_id uuid := p_org_id;
  v_app_uuid uuid;
  v_app_owner_org uuid;
  v_channel_uuid uuid;
  v_channel_app_id text;
  v_channel_org_id uuid;
  v_has boolean := false;
BEGIN
  IF p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve scope identifiers to UUIDs. Preserve the caller org when the app does not exist yet.
  IF p_app_id IS NOT NULL THEN
    SELECT id, owner_org INTO v_app_uuid, v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NOT NULL THEN
      v_org_id := v_app_owner_org;
    END IF;
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
    SELECT public.rbac_scope_org()::text AS scope_type, v_org_id AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id WHERE v_org_id IS NOT NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.is_user_org_admin(
    p_user_id uuid,
    p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.org_id = p_org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_app_admin(
    p_user_id uuid,
    p_app_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND (
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = p_app_id)
        OR (rb.scope_type = public.rbac_scope_org() AND rb.org_id = v_org_id)
      )
      AND r.name IN (public.rbac_role_app_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_org_user_privileges() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_is_super_admin boolean := false;
  v_use_rbac boolean := false;
  v_enforcing_2fa boolean := false;
BEGIN
  -- Allow service_role / postgres to bypass
  IF (((SELECT auth.jwt() ->> 'role') = 'service_role') OR ((SELECT current_user) IS NOT DISTINCT FROM 'postgres')) THEN
    RETURN NEW;
  END IF;

  v_use_rbac := public.rbac_is_enabled_for_org(NEW.org_id);

  IF v_use_rbac THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = auth.uid()
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = NEW.org_id
        AND r.name = public.rbac_role_org_super_admin()
    ) INTO v_is_super_admin;

    IF v_is_super_admin THEN
      SELECT enforcing_2fa INTO v_enforcing_2fa
      FROM public.orgs
      WHERE id = NEW.org_id;

      IF v_enforcing_2fa AND NOT public.has_2fa_enabled(auth.uid()) THEN
        PERFORM public.pg_log('deny: SUPER_ADMIN_2FA_REQUIRED', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
        v_is_super_admin := false;
      END IF;
    END IF;
  ELSE
    v_is_super_admin := public.check_min_rights(
      'super_admin'::public.user_min_right,
      (SELECT auth.uid()),
      NEW.org_id,
      NULL::character varying,
      NULL::bigint
    );
  END IF;

  IF v_is_super_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::public.user_min_right THEN
    PERFORM public.pg_log('deny: ELEVATE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::public.user_min_right THEN
    PERFORM public.pg_log('deny: ELEVATE_INVITE_SUPER_ADMIN', jsonb_build_object('org_id', NEW.org_id, 'uid', auth.uid()));
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_user_to_org(
    "email" character varying,
    "org_id" uuid,
    "invite_type" public.user_min_right
) RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  calling_user_id uuid;
  v_is_super_admin boolean := false;
  v_use_rbac boolean := false;
BEGIN
  -- Get the calling user's ID.
  SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)
  INTO calling_user_id;

  -- Treat missing orgs as unauthorized to avoid org existence enumeration.
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org.org_id;
  IF org IS NULL OR calling_user_id IS NULL THEN
    RETURN 'NO_RIGHTS';
  END IF;

  -- Check if user has at least public.rbac_right_admin() rights.
  IF NOT public.check_min_rights(public.rbac_right_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
    PERFORM public.pg_log('deny: NO_RIGHTS_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
    RETURN 'NO_RIGHTS';
  END IF;

  -- If inviting as super_admin, caller must be super_admin.
  IF (invite_type = public.rbac_right_super_admin()::public.user_min_right OR invite_type = public.rbac_right_invite_super_admin()::public.user_min_right) THEN
    v_use_rbac := public.rbac_is_enabled_for_org(invite_user_to_org.org_id);

    IF v_use_rbac THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = calling_user_id
          AND rb.scope_type = public.rbac_scope_org()
          AND rb.org_id = invite_user_to_org.org_id
          AND r.name = public.rbac_role_org_super_admin()
      ) INTO v_is_super_admin;

      IF NOT v_is_super_admin THEN
        PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
        RETURN 'NO_RIGHTS';
      END IF;

      IF org.enforcing_2fa AND NOT public.has_2fa_enabled(calling_user_id) THEN
        PERFORM public.pg_log('deny: SUPER_ADMIN_2FA_REQUIRED', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type, 'uid', calling_user_id));
        RETURN 'NO_RIGHTS';
      END IF;
    ELSE
      IF NOT public.check_min_rights(public.rbac_right_super_admin()::public.user_min_right, calling_user_id, invite_user_to_org.org_id, NULL::varchar, NULL::bigint) THEN
        PERFORM public.pg_log('deny: NO_RIGHTS_SUPER_ADMIN', jsonb_build_object('org_id', invite_user_to_org.org_id, 'invite_type', invite_user_to_org.invite_type));
        RETURN 'NO_RIGHTS';
      END IF;
    END IF;
  END IF;

  -- Check if user already exists.
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- User exists, check if already in org.
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      -- Add user to org.
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);
      RETURN 'OK';
    END IF;
  ELSE
    -- User doesn't exist, check tmp_users for pending invitations.
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org.email
      AND public.tmp_users.org_id = invite_user_to_org.org_id;

    IF current_tmp_user IS NOT NULL THEN
      -- Invitation already exists.
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        -- Invitation was cancelled, check if recent.
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      -- No invitation exists, need to create one (handled elsewhere).
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Explicitly rebuild the known RBAC policies that historically referenced
-- public.is_admin(). Relying only on pg_policies text replacement is brittle
-- because PostgreSQL can deparse policy expressions differently across
-- environments.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS roles_insert ON public.roles;
DROP POLICY IF EXISTS roles_update ON public.roles;
DROP POLICY IF EXISTS roles_delete ON public.roles;

CREATE POLICY roles_insert ON public.roles
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY roles_update ON public.roles
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY roles_delete ON public.roles
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS permissions_insert ON public.permissions;
DROP POLICY IF EXISTS permissions_update ON public.permissions;
DROP POLICY IF EXISTS permissions_delete ON public.permissions;

CREATE POLICY permissions_insert ON public.permissions
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY permissions_update ON public.permissions
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY permissions_delete ON public.permissions
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS role_permissions_insert ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_update ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_delete ON public.role_permissions;

CREATE POLICY role_permissions_insert ON public.role_permissions
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY role_permissions_update ON public.role_permissions
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY role_permissions_delete ON public.role_permissions
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS role_hierarchy_insert ON public.role_hierarchy;
DROP POLICY IF EXISTS role_hierarchy_update ON public.role_hierarchy;
DROP POLICY IF EXISTS role_hierarchy_delete ON public.role_hierarchy;

CREATE POLICY role_hierarchy_insert ON public.role_hierarchy
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY role_hierarchy_update ON public.role_hierarchy
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY role_hierarchy_delete ON public.role_hierarchy
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS groups_select ON public.groups;
DROP POLICY IF EXISTS groups_insert ON public.groups;
DROP POLICY IF EXISTS groups_update ON public.groups;
DROP POLICY IF EXISTS groups_delete ON public.groups;

CREATE POLICY groups_select ON public.groups
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE EXISTS (
            SELECT 1 FROM public.org_users
            WHERE
                org_users.org_id = groups.org_id
                AND org_users.user_id = actor_ref.current_uid
        )
    )
);

CREATE POLICY groups_insert ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE public.check_min_rights(
            public.rbac_right_admin()::public.user_min_right,
            actor_ref.current_uid,
            groups.org_id,
            null::varchar,
            null::bigint
        )
    )
);

CREATE POLICY groups_update ON public.groups
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE public.check_min_rights(
            public.rbac_right_admin()::public.user_min_right,
            actor_ref.current_uid,
            groups.org_id,
            null::varchar,
            null::bigint
        )
    )
);

CREATE POLICY groups_delete ON public.groups
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE public.check_min_rights(
            public.rbac_right_admin()::public.user_min_right,
            actor_ref.current_uid,
            groups.org_id,
            null::varchar,
            null::bigint
        )
    )
);

DROP POLICY IF EXISTS group_members_select ON public.group_members;
DROP POLICY IF EXISTS group_members_insert ON public.group_members;
DROP POLICY IF EXISTS group_members_update ON public.group_members;
DROP POLICY IF EXISTS group_members_delete ON public.group_members;

CREATE POLICY group_members_select ON public.group_members
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE EXISTS (
            SELECT 1 FROM public.groups
            INNER JOIN public.org_users ON groups.org_id = org_users.org_id
            WHERE
                groups.id = group_members.group_id
                AND org_users.user_id = actor_ref.current_uid
        )
    )
);

CREATE POLICY group_members_insert ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE EXISTS (
            SELECT 1 FROM public.groups
            WHERE
                groups.id = group_members.group_id
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    groups.org_id,
                    null::varchar,
                    null::bigint
                )
        )
    )
);

CREATE POLICY group_members_update ON public.group_members
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE EXISTS (
            SELECT 1 FROM public.groups
            WHERE
                groups.id = group_members.group_id
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    groups.org_id,
                    null::varchar,
                    null::bigint
                )
        )
    )
);

CREATE POLICY group_members_delete ON public.group_members
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE EXISTS (
            SELECT 1 FROM public.groups
            WHERE
                groups.id = group_members.group_id
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    groups.org_id,
                    null::varchar,
                    null::bigint
                )
        )
    )
);

DROP POLICY IF EXISTS role_bindings_select ON public.role_bindings;
DROP POLICY IF EXISTS role_bindings_insert ON public.role_bindings;
DROP POLICY IF EXISTS role_bindings_update ON public.role_bindings;
DROP POLICY IF EXISTS role_bindings_delete ON public.role_bindings;

CREATE POLICY role_bindings_select ON public.role_bindings
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE
            public.is_user_org_admin(
                actor_ref.current_uid,
                role_bindings.org_id
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND public.is_user_app_admin(
                    actor_ref.current_uid,
                    role_bindings.app_id
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND role_bindings.app_id IS NOT null
                AND public.user_has_role_in_app(
                    actor_ref.current_uid,
                    role_bindings.app_id
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_channel()
                AND role_bindings.channel_id IS NOT null
                AND EXISTS (
                    SELECT 1 FROM public.channels AS c
                    INNER JOIN public.apps AS a ON c.app_id = a.app_id
                    WHERE
                        c.rbac_id = role_bindings.channel_id
                        AND public.is_user_app_admin(
                            actor_ref.current_uid,
                            a.id
                        )
                )
            )
    )
);

CREATE POLICY role_bindings_insert ON public.role_bindings
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE
            (
                role_bindings.scope_type = public.rbac_scope_org()
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    role_bindings.org_id,
                    null::varchar,
                    null::bigint
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND EXISTS (
                    SELECT 1 FROM public.apps
                    WHERE
                        apps.id = role_bindings.app_id
                        AND (
                            public.check_min_rights(
                                (
                                    public.rbac_right_admin()
                                )::public.user_min_right,
                                public.get_identity_org_appid(
                                    '{all}'::public.key_mode [],
                                    apps.owner_org,
                                    apps.app_id
                                ),
                                apps.owner_org,
                                apps.app_id,
                                null::bigint
                            )
                            OR
                            public.user_has_app_update_user_roles(
                                public.get_identity_org_appid(
                                    '{all}'::public.key_mode [],
                                    apps.owner_org,
                                    apps.app_id
                                ),
                                apps.id
                            )
                        )
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_channel()
                AND EXISTS (
                    SELECT 1 FROM public.channels
                    INNER JOIN public.apps ON channels.app_id = apps.app_id
                    WHERE
                        channels.rbac_id = role_bindings.channel_id
                        AND public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.owner_org,
                            channels.app_id,
                            channels.id
                        )
                )
            )
    )
);

CREATE POLICY role_bindings_update ON public.role_bindings
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE
            (
                role_bindings.scope_type = public.rbac_scope_org()
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    role_bindings.org_id,
                    null::varchar,
                    null::bigint
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND EXISTS (
                    SELECT 1 FROM public.apps
                    WHERE
                        apps.id = role_bindings.app_id
                        AND (
                            public.check_min_rights(
                                (
                                    public.rbac_right_admin()
                                )::public.user_min_right,
                                public.get_identity_org_appid(
                                    '{all}'::public.key_mode [],
                                    apps.owner_org,
                                    apps.app_id
                                ),
                                apps.owner_org,
                                apps.app_id,
                                null::bigint
                            )
                            OR
                            public.user_has_app_update_user_roles(
                                public.get_identity_org_appid(
                                    '{all}'::public.key_mode [],
                                    apps.owner_org,
                                    apps.app_id
                                ),
                                apps.id
                            )
                        )
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_channel()
                AND EXISTS (
                    SELECT 1 FROM public.channels
                    INNER JOIN public.apps ON channels.app_id = apps.app_id
                    WHERE
                        channels.rbac_id = role_bindings.channel_id
                        AND public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            public.get_identity_org_appid(
                                '{all}'::public.key_mode [],
                                apps.owner_org,
                                apps.app_id
                            ),
                            apps.owner_org,
                            channels.app_id,
                            channels.id
                        )
                )
            )
    )
);

CREATE POLICY role_bindings_delete ON public.role_bindings
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM (SELECT auth.uid() AS current_uid) AS actor_ref
        WHERE
            (
                role_bindings.scope_type = public.rbac_scope_org()
                AND public.check_min_rights(
                    public.rbac_right_admin()::public.user_min_right,
                    actor_ref.current_uid,
                    role_bindings.org_id,
                    null::varchar,
                    null::bigint
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND EXISTS (
                    SELECT 1 FROM public.apps
                    WHERE
                        apps.id = role_bindings.app_id
                        AND public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            actor_ref.current_uid,
                            apps.owner_org,
                            apps.app_id,
                            null::bigint
                        )
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_channel()
                AND EXISTS (
                    SELECT 1 FROM public.channels
                    INNER JOIN public.apps ON channels.app_id = apps.app_id
                    WHERE
                        channels.rbac_id = role_bindings.channel_id
                        AND public.check_min_rights(
                            public.rbac_right_admin()::public.user_min_right,
                            actor_ref.current_uid,
                            apps.owner_org,
                            channels.app_id,
                            channels.id
                        )
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND public.user_has_app_update_user_roles(
                    actor_ref.current_uid,
                    role_bindings.app_id
                )
            )
            OR
            (
                role_bindings.scope_type = public.rbac_scope_app()
                AND role_bindings.principal_type = public.rbac_principal_user()
                AND role_bindings.principal_id = actor_ref.current_uid
            )
    )
);

DROP FUNCTION IF EXISTS public.is_admin(userid uuid);
DROP FUNCTION IF EXISTS public.is_admin();
