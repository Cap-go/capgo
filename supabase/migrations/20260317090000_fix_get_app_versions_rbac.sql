CREATE OR REPLACE FUNCTION "public"."get_app_versions"(
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) RETURNS integer
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT owner_org
  INTO v_org_id
  FROM public.apps
  WHERE app_id = get_app_versions.appid
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_app_read_bundles(),
    NULL::uuid,
    v_org_id,
    get_app_versions.appid,
    NULL::bigint,
    get_app_versions.apikey
  ) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT id
    FROM public.app_versions
    WHERE app_id = get_app_versions.appid
      AND name = get_app_versions.name_version
      AND owner_org = v_org_id
    LIMIT 1
  );
END;
$$;
