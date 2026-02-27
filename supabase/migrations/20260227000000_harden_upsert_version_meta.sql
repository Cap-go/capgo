-- ==========================================================================
-- Harden upsert_version_meta RPC against anonymous writes
-- ==========================================================================
CREATE OR REPLACE FUNCTION "public"."upsert_version_meta"(
  "p_app_id" character varying,
  "p_version_id" bigint,
  "p_size" bigint
) RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
AS $$
DECLARE
  existing_count integer;
  v_app_owner_org uuid;
  v_version_app_id character varying;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    IF public.get_identity('{write,all}'::public.key_mode[]) IS NULL THEN
      RETURN FALSE;
    END IF;

    SELECT apps.owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE apps.app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NULL THEN
      RETURN FALSE;
    END IF;

    IF NOT public.check_min_rights(
      'write'::public.user_min_right,
      public.get_identity_org_appid('{write,all}'::public.key_mode[], v_app_owner_org, p_app_id),
      v_app_owner_org,
      p_app_id,
      NULL::bigint
    ) THEN
      RETURN FALSE;
    END IF;

    SELECT app_id INTO v_version_app_id
    FROM public.app_versions
    WHERE id = p_version_id
    LIMIT 1;

    IF v_version_app_id IS DISTINCT FROM p_app_id THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF p_size > 0 THEN
    -- Check for existing positive size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    -- Check for existing negative size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size < 0;
  ELSE
    RETURN FALSE;
  END IF;

  IF existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (p_app_id, p_version_id, p_size);

  RETURN TRUE;

EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

ALTER FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint)
FROM
  "anon",
  "authenticated";

GRANT
EXECUTE ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint)
TO
  "service_role";
