-- ============================================================================
-- Allow trusted DB roles to resolve org_id during seed/migrations
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  auth_uid uuid;
  auth_role text;
  api_user_id uuid;
BEGIN
  SELECT apps.owner_org INTO org_id
  FROM public.apps
  WHERE ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  LIMIT 1;

  IF org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Allow trusted DB roles (seed/migrations) without JWT context
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN org_id;
  END IF;

  SELECT auth.uid() INTO auth_uid;
  IF auth_uid IS NOT NULL THEN
    IF public.check_min_rights('read'::public.user_min_right, auth_uid, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
      RETURN org_id;
    END IF;
    RETURN NULL;
  END IF;

  SELECT auth.role() INTO auth_role;
  IF auth_role = 'service_role' THEN
    RETURN org_id;
  END IF;

  SELECT public.get_identity_org_appid('{read,upload,write,all}'::public.key_mode[], org_id, get_user_main_org_id_by_app_id.app_id) INTO api_user_id;
  IF api_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.check_min_rights('read'::public.user_min_right, api_user_id, org_id, get_user_main_org_id_by_app_id.app_id, NULL::bigint) THEN
    RETURN org_id;
  END IF;

  RETURN NULL;
END;
$$;
