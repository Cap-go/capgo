-- Fix GHSA-rvvc-rvxv-qcrh:
-- Authorize encrypted-bundle cleanup RPCs through RBAC instead of stale legacy rights.

CREATE OR REPLACE FUNCTION "public"."count_non_compliant_bundles"(
  "org_id" uuid,
  "required_key" text DEFAULT NULL
) RETURNS TABLE (
  "non_encrypted_count" bigint,
  "wrong_key_count" bigint,
  "total_non_compliant" bigint
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  non_encrypted bigint := 0;
  wrong_key bigint := 0;
  caller_user_id uuid;
  api_key_text text;
BEGIN
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;
  SELECT public.get_apikey_header() INTO api_key_text;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- org.delete is the RBAC/legacy super_admin-equivalent org gate. Using it
  -- preserves the previous super_admin-only requirement for this org-wide scan.
  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_delete(),
    caller_user_id,
    count_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint,
    api_key_text
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  SELECT COUNT(*) INTO non_encrypted
  FROM public.app_versions av
  INNER JOIN public.apps a ON a.app_id = av.app_id
  WHERE a.owner_org = count_non_compliant_bundles.org_id
    AND av.deleted = false
    AND (av.session_key IS NULL OR av.session_key = '');

  IF required_key IS NOT NULL AND required_key <> '' THEN
    SELECT COUNT(*) INTO wrong_key
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = count_non_compliant_bundles.org_id
      AND av.deleted = false
      AND av.session_key IS NOT NULL
      AND av.session_key <> ''
      AND (
        av.key_id IS NULL
        OR av.key_id = ''
        -- key_id can store either the 20-char required_key prefix or the full key, so accept both match directions.
        OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
      );
  END IF;

  RETURN QUERY SELECT non_encrypted, wrong_key, (non_encrypted + wrong_key);
END;
$$;

ALTER FUNCTION "public"."count_non_compliant_bundles"(uuid, text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."count_non_compliant_bundles"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."count_non_compliant_bundles"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_non_compliant_bundles"(uuid, text) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."delete_non_compliant_bundles"(
  "org_id" uuid,
  "required_key" text DEFAULT NULL
) RETURNS bigint
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
  api_key_text text;
BEGIN
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;
  SELECT public.get_apikey_header() INTO api_key_text;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- org.delete is the RBAC/legacy super_admin-equivalent org gate. Using it
  -- preserves the previous super_admin-only requirement for this destructive cleanup.
  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_delete(),
    caller_user_id,
    delete_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint,
    api_key_text
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  IF required_key IS NULL OR required_key = '' THEN
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        (av.session_key IS NULL OR av.session_key = '')
        OR (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            -- key_id can store either the 20-char required_key prefix or the full key, so accept both match directions.
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;

ALTER FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) TO "service_role";
