-- Split platform admin detection from is_admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mfa_verified boolean;
  has_platform_admin boolean := false;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    JOIN public.roles r ON r.id = rb.role_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_platform()
      AND r.name = public.rbac_role_platform_super_admin()
  ) INTO has_platform_admin;

  RETURN has_platform_admin;
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

GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO "anon";
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO "authenticated";
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO "service_role";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "anon";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "authenticated";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "service_role";

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS 'Checks if a user is a platform admin by role binding. Always requires MFA.';

CREATE OR REPLACE FUNCTION public.is_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_admin_legacy boolean;
  mfa_verified boolean;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb
  FROM vault.decrypted_secrets
  WHERE name = 'admin_users';

  is_admin_legacy := COALESCE(admin_ids_jsonb ? userid::text, false);

  RETURN is_admin_legacy;
END;
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS 'Checks if a user is listed in legacy platform admin secret. Always requires MFA.';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SET
  search_path = ''
AS $$
BEGIN
  RETURN public.is_admin((SELECT auth.uid()));
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Legacy platform admin helper. Checks if the current user is listed in admin_users.';
