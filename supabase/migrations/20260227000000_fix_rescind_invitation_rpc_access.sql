-- Fix rescind_invitation RPC: remove anonymous access and avoid org existence enumeration.
CREATE OR REPLACE FUNCTION public.rescind_invitation(
    "email" TEXT, "org_id" UUID
) RETURNS VARCHAR LANGUAGE plpgsql SECURITY DEFINER
SET
search_path = '' AS $$
DECLARE
  tmp_user record;
BEGIN
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::varchar, NULL::bigint)) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  PERFORM 1 FROM public.orgs WHERE public.orgs.id = rescind_invitation.org_id;
  IF NOT FOUND THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = rescind_invitation.email AND public.tmp_users.org_id = rescind_invitation.org_id;
  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'ALREADY_CANCELLED';
  END IF;

  UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.rescind_invitation(TEXT, UUID) FROM public;
REVOKE ALL ON FUNCTION public.rescind_invitation(TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rescind_invitation(
    TEXT, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rescind_invitation(
    TEXT, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescind_invitation(
    TEXT, UUID
) TO service_role;
