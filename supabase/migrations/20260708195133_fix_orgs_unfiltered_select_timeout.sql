-- Fix orgs unfiltered SELECT timeouts by avoiding per-row identity resolution.
-- The previous policy called get_identity_org_allowed() and check_min_rights()
-- for every orgs row. A bare PostgREST request like /orgs can therefore scan
-- all organizations before RLS denies or filters the rows.

CREATE OR REPLACE FUNCTION "public"."orgs_readable_org_ids"()
RETURNS "uuid"[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed uuid[] := '{}'::uuid[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_user_id IS NULL AND v_api_key_text IS NULL THEN
    RETURN v_allowed;
  END IF;

  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    FROM public.find_apikey_by_value(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    v_user_id := v_api_key.user_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT allowed_orgs.org_id), '{}'::uuid[])
  INTO v_allowed
  FROM public.get_user_org_ids() allowed_orgs
  WHERE public.check_min_rights(
    'read'::public.user_min_right,
    v_user_id,
    allowed_orgs.org_id,
    NULL::character varying,
    NULL::bigint
  );

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."orgs_readable_org_ids"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."orgs_readable_org_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."orgs_readable_org_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."orgs_readable_org_ids"() IS
'Returns org IDs readable by the current authenticated user or Capgo API key. This is used by orgs RLS so unfiltered PostgREST requests compute access once and then filter by orgs.id instead of doing per-row auth work.';

DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)"
ON "public"."orgs";

CREATE POLICY "Allow select for auth, api keys (read+)"
ON "public"."orgs"
FOR SELECT
TO "anon", "authenticated"
USING (
  ((SELECT auth.uid()) IS NOT NULL OR (SELECT "public"."get_apikey_header"()) IS NOT NULL)
  AND "id" = ANY(COALESCE((SELECT "public"."orgs_readable_org_ids"()), '{}'::uuid[]))
);
