CREATE OR REPLACE FUNCTION "public"."verify_mfa"()
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
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
