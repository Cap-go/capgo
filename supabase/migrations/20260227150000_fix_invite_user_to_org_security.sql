-- Harden invite_user_to_org RPC against anonymous enumeration and disclosure.

CREATE OR REPLACE FUNCTION public.invite_user_to_org(
  "email" character varying,
  "org_id" uuid,
  "invite_type" public.user_min_right
) RETURNS character varying
  LANGUAGE plpgsql SECURITY DEFINER
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
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
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
          AND (
            (rb.scope_type = public.rbac_scope_org()
              AND rb.org_id = invite_user_to_org.org_id
              AND r.name = public.rbac_role_org_super_admin())
            OR
            (rb.scope_type = public.rbac_scope_platform()
              AND r.name = public.rbac_role_platform_super_admin())
          )
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
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- User exists, check if already in org.
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id=invited_user.id
    AND public.org_users.org_id=invite_user_to_org.org_id;

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
    WHERE public.tmp_users.email=invite_user_to_org.email
    AND public.tmp_users.org_id=invite_user_to_org.org_id;

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

REVOKE EXECUTE ON FUNCTION public.invite_user_to_org(
  character varying,
  uuid,
  public.user_min_right
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.invite_user_to_org(
  character varying,
  uuid,
  public.user_min_right
) TO "anon";

GRANT EXECUTE ON FUNCTION public.invite_user_to_org(
  character varying,
  uuid,
  public.user_min_right
) TO "authenticated";

GRANT EXECUTE ON FUNCTION public.invite_user_to_org(
  character varying,
  uuid,
  public.user_min_right
) TO "service_role";
