-- Restrict org billing/usage status RPCs
-- so anonymous callers cannot infer org plan state.
CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
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
      NULL::character varying,
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
    "actions" public.action_type []
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
) FROM public;
REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
) FROM anon;
REVOKE ALL ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_paying_and_good_plan_org_action(
    "orgid" uuid,
    "actions" public.action_type []
) TO service_role;
