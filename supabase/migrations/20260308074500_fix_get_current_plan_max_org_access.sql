-- Restrict get_current_plan_max_org to authorized org callers
-- Security fix for GHSA-v3jp-r95g-x4mm

CREATE OR REPLACE FUNCTION public.get_current_plan_max_org(orgid uuid) RETURNS TABLE (
    mau bigint,
    bandwidth bigint,
    storage bigint,
    build_time_unit bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_request_user uuid;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := (
    ((SELECT auth.jwt() ->> 'role') = 'service_role')
    OR ((SELECT session_user) IS NOT DISTINCT FROM 'postgres')
  );

  IF NOT v_is_service_role THEN
    v_request_user := public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_current_plan_max_org.orgid);

    IF v_request_user IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      v_request_user,
      get_current_plan_max_org.orgid,
      NULL::varchar,
      NULL::bigint
    ) THEN
      PERFORM public.pg_log('deny: NO_RIGHTS', jsonb_build_object('orgid', get_current_plan_max_org.orgid, 'uid', v_request_user));
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

ALTER FUNCTION public.get_current_plan_max_org(uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.get_current_plan_max_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_plan_max_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_plan_max_org(uuid) TO service_role;
