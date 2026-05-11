CREATE OR REPLACE FUNCTION "public"."verify_mfa"()
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  -- Email OTP and magic-link first-factor sessions can carry amr.method = 'otp'
  -- while remaining aal1, so MFA authorization must use the authoritative aal
  -- claim instead of accepting OTP method metadata.
  -- Zero-factor users are intentionally allowed at aal1 here; platform-admin
  -- paths must independently require aal2 before calling the admin-secret check.
  RETURN (
    array[(SELECT coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
      SELECT
          CASE
            WHEN count(id) > 0 THEN array['aal2']
            ELSE array['aal1', 'aal2']
          END AS aal
        FROM auth.mfa_factors
        WHERE (SELECT auth.uid()) = user_id AND status = 'verified'
    )
  );
END;
$$;

ALTER FUNCTION "public"."verify_mfa"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."verify_mfa"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."verify_mfa"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."verify_mfa"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."verify_mfa"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_platform_admin"()
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  -- Platform-admin actions are privileged even for admins without an enrolled
  -- factor row, so require an MFA-verified session before checking the secret.
  IF coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' THEN
    RETURN false;
  END IF;

  RETURN public.is_platform_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."is_platform_admin"() FROM "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
