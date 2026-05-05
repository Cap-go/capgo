-- Migration: Remove sso_enabled feature flag
-- SSO is now always available: enterprise orgs get the form, others get an upgrade prompt.
-- The flag is replaced by the enterprise plan check already enforced in requireEnterprisePlan.

-- 1) Update check_domain_sso: SSO is active when a provider is active (no org flag needed)
CREATE OR REPLACE FUNCTION public.check_domain_sso(p_domain text)
RETURNS TABLE (
    has_sso boolean,
    provider_id text,
    org_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        true AS has_sso,
        sp.provider_id,
        sp.org_id
    FROM public.sso_providers AS sp
    JOIN public.orgs AS o ON o.id = sp.org_id
    WHERE sp."domain" = lower(btrim(p_domain))
      AND sp.status = 'active'
    LIMIT 1;
$$;

ALTER FUNCTION public.check_domain_sso(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.check_domain_sso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO service_role;

-- 2) Update get_sso_enforcement_by_domain: same, no org flag
CREATE OR REPLACE FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" text)
RETURNS TABLE("org_id" uuid, "enforce_sso" boolean)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT
    sp.org_id,
    sp.enforce_sso
  FROM "public"."sso_providers" sp
  JOIN "public"."orgs" o ON o.id = sp.org_id
  WHERE sp.domain = lower(btrim(p_domain))
    AND sp.status = 'active'
  LIMIT 1;
$$;

ALTER FUNCTION "public"."get_sso_enforcement_by_domain"(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO service_role;

-- 3) Update generate_org_on_user_create trigger: remove sso_enabled guard from has_sso check
CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_record record;
  has_sso boolean;
  user_provider text;
BEGIN
    SELECT raw_app_meta_data->>'provider'
    INTO user_provider
    FROM auth.users
    WHERE id = NEW.id;

    SELECT EXISTS (
      SELECT 1 FROM public.sso_providers sp
      JOIN public.orgs o ON o.id = sp.org_id
      WHERE sp.domain = lower(btrim(split_part(NEW.email, '@', 2)))
      AND sp.status = 'active'
    ) INTO has_sso;

    -- Skip org creation only for genuine SAML SSO logins on SSO-managed domains.
    IF NOT (user_provider ~ '^sso:' AND has_sso) THEN
      INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * INTO org_record;
    END IF;

    RETURN NEW;
END $$;

ALTER FUNCTION public.generate_org_on_user_create() OWNER TO postgres;

-- 4) Recreate get_orgs_v7 without sso_enabled in the return type
--    Must DROP first because CREATE OR REPLACE cannot change return type.
--    Drop no-args overload first (it depends on the with-args overload).
DROP FUNCTION IF EXISTS public.get_orgs_v7();
DROP FUNCTION IF EXISTS public.get_orgs_v7(userid uuid);

CREATE FUNCTION public.get_orgs_v7() RETURNS TABLE(
  gid uuid,
  created_by uuid,
  created_at timestamp with time zone,
  logo text,
  website text,
  name text,
  role character varying,
  paying boolean,
  trial_left integer,
  can_use_more boolean,
  is_canceled boolean,
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  stats_refresh_requested_at timestamp without time zone,
  next_stats_update_at timestamp with time zone,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamp with time zone,
  enforcing_2fa boolean,
  "2fa_has_access" boolean,
  enforce_hashed_api_keys boolean,
  password_policy_config jsonb,
  password_has_access boolean,
  require_apikey_expiration boolean,
  max_apikey_expiration_days integer,
  enforce_encrypted_bundles boolean,
  required_encryption_key character varying,
  use_new_rbac boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  user_id := NULL;

  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(api_key.expires_at) THEN
      PERFORM public.pg_log('deny: API_KEY_EXPIRED', jsonb_build_object('key_id', api_key.id));
      RAISE EXCEPTION 'API key has expired';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v7(user_id) AS orgs
      WHERE orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  IF user_id IS NULL THEN
    SELECT public.get_identity() INTO user_id;

    IF user_id IS NULL THEN
      PERFORM public.pg_log('deny: UNAUTHENTICATED', '{}'::jsonb);
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.get_orgs_v7(user_id);
END;
$$;

ALTER FUNCTION public.get_orgs_v7() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v7() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v7() FROM anon;
REVOKE ALL ON FUNCTION public.get_orgs_v7() FROM authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v7() TO service_role;

CREATE FUNCTION public.get_orgs_v7(userid uuid) RETURNS TABLE(
  gid uuid,
  created_by uuid,
  created_at timestamp with time zone,
  logo text,
  website text,
  name text,
  role character varying,
  paying boolean,
  trial_left integer,
  can_use_more boolean,
  is_canceled boolean,
  app_count bigint,
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  stats_refresh_requested_at timestamp without time zone,
  next_stats_update_at timestamp with time zone,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamp with time zone,
  enforcing_2fa boolean,
  "2fa_has_access" boolean,
  enforce_hashed_api_keys boolean,
  password_policy_config jsonb,
  password_has_access boolean,
  require_apikey_expiration boolean,
  max_apikey_expiration_days integer,
  enforce_encrypted_bundles boolean,
  required_encryption_key character varying,
  use_new_rbac boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) AS cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  rbac_roles AS (
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION ALL
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  rbac_org_roles AS (
    SELECT org_id, (ARRAY_AGG(rbac_roles.name ORDER BY rbac_roles.priority_rank DESC))[1] AS role_name
    FROM rbac_roles
    GROUP BY org_id
  ),
  user_orgs AS (
    SELECT ou.org_id
    FROM public.org_users ou
    WHERE ou.user_id = userid
    UNION
    SELECT rbac_org_roles.org_id
    FROM rbac_org_roles
  ),
  time_constants AS (
    SELECT
      NOW() AS current_time,
      date_trunc('MONTH', NOW()) AS current_month_start, -- NOSONAR: migration-local billing anchor
      '0 DAYS'::INTERVAL AS zero_day_interval
  ),
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 AS preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    CROSS JOIN time_constants tc
    WHERE (
      (si.status = 'succeeded' -- NOSONAR: existing stripe_info status contract
        AND (si.canceled_at IS NULL OR si.canceled_at > tc.current_time)
        AND si.subscription_anchor_end > tc.current_time)
      OR si.trial_at > tc.current_time
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
             > tc.current_time - tc.current_month_start
        THEN date_trunc('MONTH', tc.current_time - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
        ELSE tc.current_month_start
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
      END AS cycle_start
    FROM public.orgs o
    CROSS JOIN time_constants tc
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  ),
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE o.created_at
    END AS created_at,
    o.logo,
    o.website,
    o.name,
    CASE
      WHEN o.use_new_rbac AND ou.user_right::text LIKE 'invite_%' THEN ou.user_right::varchar
      WHEN o.use_new_rbac THEN COALESCE(ror.role_name, ou.rbac_role_name, ou.user_right::varchar)
      ELSE COALESCE(ou.user_right::varchar, ror.role_name)
    END AS role,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'succeeded', false) -- NOSONAR: existing stripe_info status contract
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE((si.status = 'succeeded' AND si.is_good_plan = true) -- NOSONAR: existing stripe_info status contract
        OR (si.trial_at::date - NOW()::date > 0)
        OR COALESCE(ucb.available_credits, 0) > 0, false)
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'canceled', false)
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
    o.stats_refresh_requested_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.available_credits, 0)
    END AS credit_available,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.total_credits, 0)
    END AS credit_total,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE ucb.next_expiration
    END AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles,
    o.required_encryption_key,
    o.use_new_rbac
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  LEFT JOIN rbac_org_roles ror ON ror.org_id = o.id
  LEFT JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v7(userid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(userid uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(userid uuid) TO service_role;

-- 5) Drop the column — functions no longer reference it
ALTER TABLE public.orgs DROP COLUMN sso_enabled;
