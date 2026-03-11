-- Split platform admin detection from is_admin
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

REVOKE ALL ON FUNCTION public.is_platform_admin(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_admin(userid uuid) TO "service_role";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "authenticated";
GRANT ALL ON FUNCTION public.is_platform_admin() TO "service_role";

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS 'Checks if a user is platform admin from admin_users secret. Always requires MFA.';

-- NOTE: is_admin() is kept for legacy/internal compatibility.
-- RLS no longer relies on is_admin(); platform-admin checks use is_platform_admin().
CREATE OR REPLACE FUNCTION public.is_admin(userid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mfa_verified boolean;
  rbac_enabled boolean;
  is_admin_from_rbac boolean := false;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT COALESCE(use_new_rbac, false) INTO rbac_enabled
  FROM public.rbac_settings
  WHERE id = 1;

  IF NOT rbac_enabled THEN
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
  ) INTO is_admin_from_rbac;

  RETURN is_admin_from_rbac;
END;
$$;

COMMENT ON FUNCTION public.is_admin(uuid) IS 'Checks if a user is platform admin through RBAC only. Always requires MFA.';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET
  search_path = ''
AS $$
BEGIN
  RETURN public.is_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION public.is_admin(userid uuid) OWNER TO "postgres";
ALTER FUNCTION public.is_admin() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_admin(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO "service_role";
GRANT ALL ON FUNCTION public.is_admin() TO "authenticated";
GRANT ALL ON FUNCTION public.is_admin() TO "service_role";

COMMENT ON FUNCTION public.is_admin() IS 'Checks if the current user is platform admin through RBAC. Always requires MFA.';
