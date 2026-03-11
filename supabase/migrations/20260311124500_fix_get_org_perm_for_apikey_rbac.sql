CREATE OR REPLACE FUNCTION public.get_org_perm_for_apikey(apikey text, app_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
<<get_org_perm_for_apikey>>
DECLARE
  apikey_user_id uuid;
  org_id uuid;
  api_key record;
BEGIN
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;
  apikey_user_id := api_key.user_id;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org
  INTO org_id
  FROM public.apps
  WHERE apps.app_id = get_org_perm_for_apikey.app_id
  LIMIT 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'NO_APP';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_transfer(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_delete(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_update_settings(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_upload_bundle(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_read(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_read';
  END IF;

  PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
  RETURN 'perm_none';
END;
$function$;
