-- Pass app_id through the plan-check RPC chain so RBAC's app-scope restriction
-- in rbac_check_permission_direct gets the app context it needs when an API
-- key has limited_to_apps set. Without this, an org-scope read by a key
-- restricted to an app fails RBAC and surfaces in the CLI as the misleading
-- "Plan upgrade required for upload" error, even when the plan is healthy.
--
-- Strategy: add new 3-arg overloads alongside the existing 2-arg versions.
-- Existing callers keep working unchanged; new callers (e.g. CLI upload path)
-- can pass appid to thread it into check_min_rights.

CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  caller_role text;
  org_customer_id text;
  result boolean;
  has_credits boolean;
BEGIN
  SELECT current_setting('role', true) INTO caller_role;

  IF COALESCE(caller_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NOT (public.check_min_rights(
      'read'::public.user_min_right,
      (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_paying_and_good_plan_org_action.orgid)),
      is_paying_and_good_plan_org_action.orgid,
      is_paying_and_good_plan_org_action.appid,
      NULL::bigint
    )) THEN
      RETURN false;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usage_credit_balances ucb
    WHERE ucb.org_id = orgid
      AND COALESCE(ucb.available_credits, 0) > 0
  ) INTO has_credits;

  IF has_credits THEN
    RETURN true;
  END IF;

  SELECT o.customer_id INTO org_customer_id
  FROM public.orgs o
  WHERE o.id = orgid;

  SELECT (si.trial_at > now()) OR (si.status = 'succeeded' AND NOT (
      (si.mau_exceeded AND 'mau' = ANY(actions))
      OR (si.storage_exceeded AND 'storage' = ANY(actions))
      OR (si.bandwidth_exceeded AND 'bandwidth' = ANY(actions))
      OR (si.build_time_exceeded AND 'build_time' = ANY(actions))
    ))
  INTO result
  FROM public.stripe_info si
  WHERE si.customer_id = org_customer_id
  LIMIT 1;

  RETURN COALESCE(result, false);
END;
$$;

ALTER FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) FROM public;
REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) FROM anon;
REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) TO service_role;

CREATE OR REPLACE FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions, appid);
END;
$$;

ALTER FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) FROM public;
-- The CLI connects with the Supabase anon key and authenticates per-call via
-- the capgkey header, so PostgREST sets role = anon. The existing 2-arg
-- overload grants EXECUTE to anon (see 20260427105151); the new 3-arg overload
-- must match or the CLI upload path will fail with a permission error.
GRANT EXECUTE ON FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) TO anon;
GRANT EXECUTE ON FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_allowed_action_org_action(
    "orgid" uuid,
    "actions" public.action_type [],
    "appid" character varying
) TO service_role;
