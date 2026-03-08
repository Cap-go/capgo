-- Harden version metadata writes against cross-tenant RPC abuse.
REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint)
FROM
  "public",
  "anon",
  "authenticated";

GRANT
EXECUTE ON FUNCTION "public"."upsert_version_meta"(
    "p_app_id" character varying,
    "p_version_id" bigint,
    "p_size" bigint
) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."upsert_version_meta"(
  "p_app_id" character varying,
  "p_version_id" bigint,
  "p_size" bigint
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
AS $$
DECLARE
  v_owner_org uuid;
  v_caller_id uuid;
  v_existing_count integer;
BEGIN
  IF p_size = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT owner_org
  INTO v_owner_org
  FROM public.apps
  WHERE app_id = p_app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres') THEN
    SELECT public.get_identity_org_appid('{write,all}'::public.key_mode[], v_owner_org, p_app_id)
      INTO v_caller_id;

    IF v_caller_id IS NULL THEN
      RETURN FALSE;
    END IF;

    IF NOT public.check_min_rights(
      'write'::public.user_min_right,
      v_caller_id,
      v_owner_org,
      p_app_id,
      NULL::bigint
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check if a row already exists for this app_id/version_id with same sign.
  IF p_size > 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size < 0;
  END IF;

  -- If row already exists, do nothing and return false.
  IF v_existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (
    p_app_id,
    p_version_id,
    p_size
  );

  RETURN TRUE;

EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

ALTER FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) OWNER TO "postgres";
