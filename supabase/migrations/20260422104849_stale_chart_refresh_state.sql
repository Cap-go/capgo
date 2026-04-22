ALTER TABLE public.apps
ADD COLUMN IF NOT EXISTS stats_updated_at timestamp without time zone;

ALTER TABLE public.apps
ADD COLUMN IF NOT EXISTS stats_refresh_requested_at timestamp without time zone;

ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS stats_refresh_requested_at timestamp without time zone;

UPDATE public.apps AS apps
SET stats_updated_at = orgs.stats_updated_at
FROM public.orgs AS orgs
WHERE apps.owner_org = orgs.id
  AND apps.stats_updated_at IS NULL
  AND orgs.stats_updated_at IS NOT NULL;

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
  use_new_rbac boolean,
  sso_enabled boolean
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
  use_new_rbac boolean,
  sso_enabled boolean
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
    o.use_new_rbac,
    o.sso_enabled
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

CREATE OR REPLACE FUNCTION public.queue_cron_stat_app_for_app(
  p_app_id character varying,
  p_org_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_org_id uuid;
  v_now_utc timestamp without time zone;
  v_refresh_ttl CONSTANT interval := INTERVAL '5 minutes'; -- NOSONAR: function-local refresh TTL
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RETURN;
  END IF;

  v_now_utc := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());

  UPDATE public.apps AS a
  SET stats_refresh_requested_at = v_now_utc
  WHERE a.app_id = p_app_id
    AND (p_org_id IS NULL OR a.owner_org = p_org_id)
    AND (a.stats_updated_at IS NULL OR a.stats_updated_at < v_now_utc - v_refresh_ttl)
    AND (a.stats_refresh_requested_at IS NULL OR a.stats_refresh_requested_at < v_now_utc - v_refresh_ttl)
  RETURNING a.owner_org
  INTO v_org_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pgmq.q_cron_stat_app AS queued_job
    WHERE queued_job.message->'payload'->>'appId' = p_app_id
  ) THEN
    RETURN;
  END IF;

  PERFORM pgmq.send('cron_stat_app',
    pg_catalog.jsonb_build_object(
      'function_name', 'cron_stat_app',
      'function_type', 'cloudflare',
      'payload', pg_catalog.jsonb_build_object(
        'appId', p_app_id,
        'orgId', v_org_id,
        'todayOnly', false
      )
    )
  );
END;
$function$;

ALTER FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.queue_cron_stat_app_for_app(character varying, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_app_stats_refreshed(
  p_app_id character varying
) RETURNS timestamp without time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_now_utc timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN -- NOSONAR: explicit empty-string guard
    RETURN NULL;
  END IF;

  UPDATE public.apps
  SET stats_updated_at = v_now_utc
  WHERE app_id = p_app_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_now_utc;
END;
$function$;

ALTER FUNCTION public.mark_app_stats_refreshed(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_app_stats_refreshed(character varying) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_app_stats_refreshed(character varying) FROM anon;
REVOKE ALL ON FUNCTION public.mark_app_stats_refreshed(character varying) FROM authenticated;
GRANT ALL ON FUNCTION public.mark_app_stats_refreshed(character varying) TO service_role;

CREATE OR REPLACE FUNCTION public.request_app_chart_refresh(app_id character varying)
RETURNS TABLE(
  requested_at timestamp without time zone,
  queued_app_ids character varying[],
  queued_count integer,
  skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_role text;
  caller_id uuid;
  v_org_id uuid;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued boolean := false;
  v_privileged_roles CONSTANT text[] := ARRAY['service_role', 'postgres', 'supabase_admin']; -- NOSONAR: function-local privileged role set
  v_read_key_modes CONSTANT public.key_mode[] := '{read,upload,write,all}'::public.key_mode[]; -- NOSONAR: function-local key mode set
  v_read_min_right CONSTANT public.user_min_right := 'read'::public.user_min_right;
BEGIN
  IF request_app_chart_refresh.app_id IS NULL OR request_app_chart_refresh.app_id = '' THEN
    RAISE EXCEPTION 'App ID is required';
  END IF;

  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), -- NOSONAR: request role lookup reused across overloads
    NULLIF(pg_catalog.current_setting('role', true), ''),
    NULLIF(COALESCE(session_user, current_user), '')
  ) INTO caller_role;

  SELECT a.owner_org, a.stats_refresh_requested_at
  INTO v_org_id, v_before_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  IF caller_role = ANY(v_privileged_roles) AND v_org_id IS NULL THEN
    RAISE EXCEPTION 'App not found';
  END IF;

  IF caller_role <> ALL(v_privileged_roles) THEN
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'App access denied';
    END IF;

    SELECT public.get_identity_org_appid(
      v_read_key_modes,
      v_org_id,
      request_app_chart_refresh.app_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      v_read_min_right,
      caller_id,
      v_org_id,
      request_app_chart_refresh.app_id,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'App access denied';
    END IF;
  END IF;

  PERFORM public.queue_cron_stat_app_for_app(request_app_chart_refresh.app_id, v_org_id);

  SELECT a.stats_refresh_requested_at
  INTO v_after_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  v_queued := v_after_requested_at IS NOT NULL
    AND v_after_requested_at >= v_request_started_at
    AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at);

  RETURN QUERY
  SELECT
    v_after_requested_at,
    CASE
      WHEN v_queued THEN ARRAY[request_app_chart_refresh.app_id]::character varying[]
      ELSE ARRAY[]::character varying[]
    END,
    CASE WHEN v_queued THEN 1 ELSE 0 END,
    CASE WHEN v_queued THEN 0 ELSE 1 END;
END;
$function$;

ALTER FUNCTION public.request_app_chart_refresh(character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_app_chart_refresh(character varying) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_app_chart_refresh(character varying) FROM anon;
REVOKE ALL ON FUNCTION public.request_app_chart_refresh(character varying) FROM authenticated;
GRANT ALL ON FUNCTION public.request_app_chart_refresh(character varying) TO authenticated;
GRANT ALL ON FUNCTION public.request_app_chart_refresh(character varying) TO service_role;

CREATE OR REPLACE FUNCTION public.request_org_chart_refresh(org_id uuid)
RETURNS TABLE(
  requested_at timestamp without time zone,
  queued_app_ids character varying[],
  queued_count integer,
  skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_role text;
  caller_id uuid;
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued_app_ids character varying[] := ARRAY[]::character varying[];
  v_queued_count integer := 0;
  v_total_count integer := 0;
  v_org_exists boolean := false;
  v_org_requested_at_before timestamp without time zone;
  v_return_requested_at timestamp without time zone;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  app_record record;
  v_privileged_roles CONSTANT text[] := ARRAY['service_role', 'postgres', 'supabase_admin']; -- NOSONAR: function-local privileged role set
  v_read_key_modes CONSTANT public.key_mode[] := '{read,upload,write,all}'::public.key_mode[]; -- NOSONAR: function-local key mode set
  v_read_min_right CONSTANT public.user_min_right := 'read'::public.user_min_right;
BEGIN
  IF request_org_chart_refresh.org_id IS NULL THEN
    RAISE EXCEPTION 'Org ID is required';
  END IF;

  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), -- NOSONAR: request role lookup reused across overloads
    NULLIF(pg_catalog.current_setting('role', true), ''),
    NULLIF(COALESCE(session_user, current_user), '')
  ) INTO caller_role;

  SELECT o.stats_refresh_requested_at
  INTO v_org_requested_at_before
  FROM public.orgs o
  WHERE o.id = request_org_chart_refresh.org_id
  LIMIT 1;

  v_org_exists := FOUND;

  IF caller_role = ANY(v_privileged_roles) AND NOT v_org_exists THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF caller_role <> ALL(v_privileged_roles) THEN
    IF NOT v_org_exists THEN
      RAISE EXCEPTION 'Organization access denied';
    END IF;

    SELECT public.get_identity_org_allowed(
      v_read_key_modes,
      request_org_chart_refresh.org_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      v_read_min_right,
      caller_id,
      request_org_chart_refresh.org_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RAISE EXCEPTION 'Organization access denied';
    END IF;
  END IF;

  FOR app_record IN
    SELECT a.app_id, a.stats_refresh_requested_at
    FROM public.apps a
    WHERE a.owner_org = request_org_chart_refresh.org_id
    ORDER BY a.app_id
  LOOP
    v_total_count := v_total_count + 1;
    v_before_requested_at := app_record.stats_refresh_requested_at;

    PERFORM public.queue_cron_stat_app_for_app(app_record.app_id, request_org_chart_refresh.org_id);

    SELECT a.stats_refresh_requested_at
    INTO v_after_requested_at
    FROM public.apps a
    WHERE a.app_id = app_record.app_id
    LIMIT 1;

    IF v_after_requested_at IS NOT NULL
      AND v_after_requested_at >= v_request_started_at
      AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at) THEN
      v_queued_count := v_queued_count + 1;
      v_queued_app_ids := array_append(v_queued_app_ids, app_record.app_id);
    END IF;
  END LOOP;

  IF v_queued_count > 0 THEN
    UPDATE public.orgs
    SET stats_refresh_requested_at = v_request_started_at
    WHERE id = request_org_chart_refresh.org_id;

    v_return_requested_at := v_request_started_at;
  ELSE
    v_return_requested_at := v_org_requested_at_before;
  END IF;

  RETURN QUERY
  SELECT
    v_return_requested_at,
    COALESCE(v_queued_app_ids, ARRAY[]::character varying[]),
    v_queued_count,
    GREATEST(v_total_count - v_queued_count, 0);
END;
$function$;

ALTER FUNCTION public.request_org_chart_refresh(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_org_chart_refresh(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_org_chart_refresh(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.request_org_chart_refresh(uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.request_org_chart_refresh(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.request_org_chart_refresh(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_app_metrics(
  "p_org_id" uuid,
  "p_app_id" character varying,
  "p_start_date" date,
  "p_end_date" date
)
RETURNS TABLE(
  app_id character varying,
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_unit bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  caller_role text;
  caller_id uuid;
  app_exists boolean;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes'; -- NOSONAR: function-local cache TTL
  v_privileged_roles CONSTANT text[] := ARRAY['service_role', 'postgres', 'supabase_admin']; -- NOSONAR: function-local privileged role set
  v_read_key_modes CONSTANT public.key_mode[] := '{read,upload,write,all}'::public.key_mode[]; -- NOSONAR: function-local key mode set
  v_read_min_right CONSTANT public.user_min_right := 'read'::public.user_min_right;
BEGIN
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), -- NOSONAR: request role lookup reused across overloads
    NULLIF(pg_catalog.current_setting('role', true), ''),
    NULLIF(COALESCE(session_user, current_user), '')
  ) INTO caller_role;

  IF caller_role <> ALL(v_privileged_roles) THEN
    SELECT public.get_identity_org_appid(
      v_read_key_modes,
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      v_read_min_right,
      caller_id,
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id,
      NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = get_app_metrics.p_app_id
      AND apps.owner_org = get_app_metrics.p_org_id
  ) INTO app_exists;

  IF NOT app_exists THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.p_org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.p_org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.p_start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.p_end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.p_org_id,
      get_app_metrics.p_start_date,
      get_app_metrics.p_end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  WHERE metrics.app_id = get_app_metrics.p_app_id
  ORDER BY metrics.date;
END;
$function$;

ALTER FUNCTION public.get_app_metrics(uuid, character varying, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) FROM authenticated;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO anon;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO authenticated;
GRANT ALL ON FUNCTION public.get_app_metrics(uuid, character varying, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_app_metrics(
  "org_id" uuid,
  "start_date" date,
  "end_date" date
)
RETURNS TABLE(
  app_id character varying,
  date date,
  mau bigint,
  storage bigint,
  bandwidth bigint,
  build_time_unit bigint,
  get bigint,
  fail bigint,
  install bigint,
  uninstall bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  caller_role text;
  caller_id uuid;
  org_exists boolean;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes'; -- NOSONAR: function-local cache TTL
  v_privileged_roles CONSTANT text[] := ARRAY['service_role', 'postgres', 'supabase_admin']; -- NOSONAR: function-local privileged role set
  v_read_key_modes CONSTANT public.key_mode[] := '{read,upload,write,all}'::public.key_mode[]; -- NOSONAR: function-local key mode set
  v_read_min_right CONSTANT public.user_min_right := 'read'::public.user_min_right;
BEGIN
  SELECT COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), -- NOSONAR: request role lookup reused across overloads
    NULLIF(pg_catalog.current_setting('role', true), ''),
    NULLIF(COALESCE(session_user, current_user), '')
  ) INTO caller_role;

  IF caller_role <> ALL(v_privileged_roles) THEN
    SELECT public.get_identity_org_allowed(
      v_read_key_modes,
      get_app_metrics.org_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      v_read_min_right,
      caller_id,
      get_app_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE orgs.id = get_app_metrics.org_id
  ) INTO org_exists;

  IF NOT org_exists THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.org_id,
      get_app_metrics.start_date,
      get_app_metrics.end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  ORDER BY metrics.app_id, metrics.date;
END;
$function$;

ALTER FUNCTION public.get_app_metrics(uuid, date, date) OWNER TO postgres;
