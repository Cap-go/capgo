-- Fix app_versions unfiltered SELECT timeouts by avoiding per-row identity
-- resolution. The previous policy called get_identity_org_appid() and
-- check_min_rights() for every app_versions row, so unauthenticated anon
-- requests with no Capgo API key could force expensive scans before RLS denied
-- access. Compute readable app IDs once per statement, then use the indexed
-- app_id predicate in the RLS policy.

CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"()
RETURNS character varying[]
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_allowed character varying[] := '{}'::character varying[];
BEGIN
  SELECT auth.uid() INTO v_user_id;

  -- If no authenticated user is present, authenticate through the Capgo API key
  -- header once. No API key means the anon request can read no app_versions.
  IF v_user_id IS NULL THEN
    SELECT public.get_apikey_header() INTO v_api_key_text;
    IF v_api_key_text IS NULL THEN
      RETURN v_allowed;
    END IF;

    SELECT *
    FROM public.find_apikey_by_value(v_api_key_text)
    INTO v_api_key;

    IF v_api_key.id IS NULL THEN
      RETURN v_allowed;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    IF v_api_key.mode IS NOT NULL THEN
      IF NOT (v_api_key.mode = ANY('{read,upload,write,all}'::public.key_mode[])) THEN
        RETURN v_allowed;
      END IF;

      v_user_id := v_api_key.user_id;
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM public.apps
  WHERE (
      v_api_key.id IS NULL
      OR COALESCE(array_length(v_api_key.limited_to_orgs, 1), 0) = 0
      OR apps.owner_org = ANY(v_api_key.limited_to_orgs)
    )
    AND (
      v_api_key.id IS NULL
      OR v_api_key.limited_to_apps IS NULL
      OR v_api_key.limited_to_apps = '{}'::character varying[]
      OR apps.app_id = ANY(v_api_key.limited_to_apps)
    )
    AND public.check_min_rights(
      'read'::public.user_min_right,
      v_user_id,
      apps.owner_org,
      apps.app_id,
      NULL::bigint
    );

  RETURN v_allowed;
END;
$$;

ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."app_versions_readable_app_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."app_versions_readable_app_ids"() TO "service_role";

COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS
'Returns the app IDs whose bundle rows are readable by the current authenticated user or Capgo API key. This intentionally reveals only app IDs the caller can already list through normal app/bundle read access, and is used by app_versions RLS to avoid per-row auth work on unfiltered PostgREST requests.';

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" -- noqa: RF05,LT05
ON "public"."app_versions";

CREATE POLICY "Allow for auth, api keys (read+)" -- noqa: RF05,LT05
ON "public"."app_versions"
FOR SELECT
TO "anon", "authenticated"
USING (
  "app_id" = ANY(
    COALESCE((SELECT "public"."app_versions_readable_app_ids"()), '{}'::character varying[])
  )
  AND EXISTS (
    SELECT 1
    FROM "public"."apps"
    WHERE "apps"."app_id" = "app_versions"."app_id"
      AND "apps"."owner_org" = "app_versions"."owner_org"
  )
);
