-- Security hardening: remove API key identity oracle and enforce org RPC caller checks

-- Identity helpers are needed by RLS, so keep `anon`/`authenticated` execute
-- for org helpers while blocking external API-key identity oracle access.
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode"[]) FROM "public";
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode"[]) FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode"[]) FROM "authenticated";
REVOKE ALL ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode"[], "org_id" "uuid") FROM "public";
REVOKE ALL ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode"[],
  "org_id" "uuid",
  "app_id" character varying
) FROM "public";

-- Keep these helpers available where needed by RLS and trusted internal services.
-- Keep these helpers available where needed by RLS and trusted internal services.
GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode"[]) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode"[]) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode"[], "org_id" "uuid") TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode"[], "org_id" "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode"[], "org_id" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode"[], "org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode"[],
  "org_id" "uuid",
  "app_id" character varying
) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode"[],
  "org_id" "uuid",
  "app_id" character varying
) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode"[],
  "org_id" "uuid",
  "app_id" character varying
) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode"[],
  "org_id" "uuid",
  "app_id" character varying
) TO "authenticated";

-- Remove broad default privileges so future objects do not inherit anonymous/authenticated access.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "public";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "public";


-- Harden direct org lookup by user id: callable only when caller identity matches the requested user.
DROP FUNCTION IF EXISTS public.get_orgs_v6(userid uuid);

CREATE OR REPLACE FUNCTION public.get_orgs_v6(userid uuid)
RETURNS TABLE (
    gid uuid,
    created_by uuid,
    logo text,
    name text,
    role character varying,
    paying boolean,
    trial_left integer,
    can_use_more boolean,
    is_canceled boolean,
    app_count bigint,
    subscription_start timestamptz,
    subscription_end timestamptz,
    management_email text,
    is_yearly boolean,
    stats_updated_at timestamp without time zone,
    next_stats_update_at timestamptz,
    credit_available numeric,
    credit_total numeric,
    credit_next_expiration timestamptz,
    require_apikey_expiration boolean,
    max_apikey_expiration_days integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  caller_user_id uuid;
BEGIN
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF auth.role() IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'postgres' THEN
    IF caller_user_id IS DISTINCT FROM userid THEN
      PERFORM public.pg_log(
        'deny: GET_ORGS_V6_UNAUTHORIZED_USER',
        jsonb_build_object('requested_user_id', userid, 'resolved_user_id', caller_user_id, 'role', auth.role())
      );
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) as cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > NOW())
        AND si.subscription_anchor_end > NOW())
      OR si.trial_at > NOW()
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > NOW() - date_trunc('MONTH', NOW())
        THEN date_trunc('MONTH', NOW() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', NOW())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  ),
  -- Calculate password policy access status for user/org combinations
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- Redact sensitive fields if user doesn't have 2FA or password policy access
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - NOW()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v6(userid uuid) OWNER TO "postgres";

-- Only trusted roles may execute the user-id overload directly.
REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM "anon";
REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(userid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(userid uuid) TO "service_role";
