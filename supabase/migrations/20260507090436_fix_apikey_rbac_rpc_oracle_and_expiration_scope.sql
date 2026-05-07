CREATE OR REPLACE FUNCTION "public"."cli_check_permission"(
  "apikey" "text" DEFAULT NULL,
  "permission_key" "text" DEFAULT NULL,
  "org_id" "uuid" DEFAULT NULL,
  "app_id" "text" DEFAULT NULL,
  "channel_id" bigint DEFAULT NULL
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  IF permission_key IS NULL OR permission_key = '' THEN
    RETURN false;
  END IF;

  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN false;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN false;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    permission_key,
    v_api_key.user_id,
    org_id,
    app_id,
    channel_id,
    v_request_apikey
  );
END;
$$;

ALTER FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) TO "service_role";

COMMENT ON FUNCTION "public"."cli_check_permission"(
  "apikey" "text",
  "permission_key" "text",
  "org_id" "uuid",
  "app_id" "text",
  "channel_id" bigint
) IS 'CLI permission wrapper bound to the request capgkey header. The apikey argument is retained for CLI compatibility and must match the header when provided.';

CREATE OR REPLACE FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text" DEFAULT NULL
) RETURNS SETOF "public"."apps"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.apps a
  WHERE public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    v_api_key.user_id,
    a.owner_org,
    a.app_id,
    NULL,
    v_request_apikey
  )
  ORDER BY a.created_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) TO "service_role";

COMMENT ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"(
  "apikey" "text"
) IS 'Returns apps visible to the request capgkey using RBAC-aware permission checks with legacy fallback. The apikey argument is retained for CLI compatibility and must match the header when provided.';

CREATE OR REPLACE FUNCTION public.enforce_apikey_expiration_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  scoped_org RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
    AND NEW.limited_to_orgs IS NOT DISTINCT FROM OLD.limited_to_orgs
    AND NEW.limited_to_apps IS NOT DISTINCT FROM OLD.limited_to_apps THEN
    RETURN NEW;
  END IF;

  FOR scoped_org IN
    WITH explicit_scope_orgs AS (
      SELECT unnest(COALESCE(NEW.limited_to_orgs, '{}'::uuid[])) AS org_id
      UNION
      SELECT public.apps.owner_org
      FROM public.apps
      WHERE public.apps.app_id = ANY(COALESCE(NEW.limited_to_apps, '{}'::text[]))
    ),
    scope_orgs AS (
      SELECT explicit_scope_orgs.org_id
      FROM explicit_scope_orgs
      UNION
      SELECT public.org_users.org_id
      FROM public.org_users
      WHERE public.org_users.user_id = NEW.user_id
        AND COALESCE(array_length(NEW.limited_to_orgs, 1), 0) = 0
        AND COALESCE(array_length(NEW.limited_to_apps, 1), 0) = 0
    )
    SELECT
      public.orgs.id,
      public.orgs.require_apikey_expiration,
      public.orgs.max_apikey_expiration_days
    FROM public.orgs
    JOIN scope_orgs ON scope_orgs.org_id = public.orgs.id
  LOOP
    IF scoped_org.require_apikey_expiration AND NEW.expires_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_required',
        DETAIL = 'This organization requires API keys to have an expiration date';
    END IF;

    IF scoped_org.max_apikey_expiration_days IS NOT NULL
      AND NEW.expires_at IS NOT NULL
      AND NEW.expires_at > clock_timestamp()
        + make_interval(days => scoped_org.max_apikey_expiration_days) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_exceeds_max',
        DETAIL = format(
          'API key expiration cannot exceed %s days for this organization',
          scoped_org.max_apikey_expiration_days
        );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_apikey_expiration_policy() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.enforce_apikey_expiration_policy() FROM public;
GRANT EXECUTE ON FUNCTION public.enforce_apikey_expiration_policy() TO service_role;

DROP TRIGGER IF EXISTS apikeys_enforce_expiration_policy ON public.apikeys;

CREATE TRIGGER apikeys_enforce_expiration_policy
BEFORE INSERT OR UPDATE ON public.apikeys
FOR EACH ROW
EXECUTE FUNCTION public.enforce_apikey_expiration_policy();
