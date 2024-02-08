CREATE OR REPLACE FUNCTION "public"."has_read_rights"("appid" character varying)
 RETURNS boolean
 LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  RETURN (is_owner_of_org(auth.uid(), org_id) OR check_min_rights('read'::user_min_right, auth.uid(), org_id, NULL::character varying, NULL::bigint));
End;
$$;

CREATE OR REPLACE FUNCTION "public"."has_app_right"("appid" character varying, "right" user_min_right)
 RETURNS boolean
 LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  RETURN (is_owner_of_org(auth.uid(), org_id) OR check_min_rights("right", auth.uid(), org_id, NULL::character varying, NULL::bigint));
End;
$$;