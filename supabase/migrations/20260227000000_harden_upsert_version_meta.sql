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
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    RETURN FALSE;
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
