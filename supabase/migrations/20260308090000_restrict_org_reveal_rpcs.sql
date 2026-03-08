-- Restrict org metadata RPCs so anonymous callers cannot enumerate org IDs or infer billing status.
CREATE OR REPLACE FUNCTION "public"."is_paying_org" ("orgid" "uuid") RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = '' AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT current_setting('role', true) INTO caller_role;

  IF COALESCE(caller_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NOT (public.check_min_rights(
      'read'::public.user_min_right,
      (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_paying_org.orgid)),
      is_paying_org.orgid,
      NULL::character varying,
      NULL::bigint
    )) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (SELECT EXISTS (
    SELECT 1
    FROM public.stripe_info
    WHERE  customer_id=(SELECT customer_id FROM public.orgs WHERE  id=orgid)
    AND status = 'succeeded'
  ));
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_trial_org" ("orgid" "uuid") RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = '' AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT current_setting('role', true) INTO caller_role;

  IF COALESCE(caller_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NOT (public.check_min_rights(
      'read'::public.user_min_right,
      (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_trial_org.orgid)),
      is_trial_org.orgid,
      NULL::character varying,
      NULL::bigint
    )) THEN
      RETURN 0;
    END IF;
  END IF;

  RETURN (SELECT GREATEST((trial_at::date - (NOW())::date), 0) AS days
  FROM public.stripe_info
  WHERE customer_id=(SELECT customer_id FROM public.orgs WHERE id=orgid));
END;
$$;

REVOKE ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") TO "service_role";
