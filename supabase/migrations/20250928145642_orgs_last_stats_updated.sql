-- Add a nullable column to track when org stats were last refreshed
ALTER TABLE public.orgs
  ADD COLUMN stats_updated_at timestamp WITHOUT time zone;

-- Expose stats_updated_at via get_orgs_v6 helpers
DROP FUNCTION IF EXISTS public.get_orgs_v6();
DROP FUNCTION IF EXISTS public.get_orgs_v6(uuid);

CREATE OR REPLACE FUNCTION public.get_orgs_v6 () RETURNS TABLE (
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
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  next_stats_update_at timestamp with time zone,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamptz
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  user_id := NULL;

  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key = api_key_text INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    user_id := api_key.user_id;

    IF COALESCE(array_length(api_key.limited_to_orgs, 1), 0) > 0 THEN
      RETURN QUERY
      SELECT orgs.*
      FROM public.get_orgs_v6(user_id) AS orgs
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

  RETURN QUERY SELECT * FROM public.get_orgs_v6(user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orgs_v6 (userid uuid) RETURNS TABLE (
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
  subscription_start timestamp with time zone,
  subscription_end timestamp with time zone,
  management_email text,
  is_yearly boolean,
  stats_updated_at timestamp without time zone,
  next_stats_update_at timestamp with time zone,
  credit_available numeric,
  credit_total numeric,
  credit_next_expiration timestamptz
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sub.id AS gid,
    sub.created_by,
    sub.logo,
    sub.name,
    org_users.user_right::varchar AS role,
    public.is_paying_org(sub.id) AS paying,
    public.is_trial_org(sub.id) AS trial_left,
    public.is_allowed_action_org(sub.id) AS can_use_more,
    public.is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM public.apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email,
    public.is_org_yearly(sub.id) AS is_yearly,
    sub.stats_updated_at,
    public.get_next_stats_update_date(sub.id) AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration
  FROM (
    SELECT public.get_cycle_info_org(o.id) AS f, o.* FROM public.orgs AS o
  ) AS sub
  JOIN public.org_users
    ON org_users.user_id = userid
   AND sub.id = org_users.org_id
  LEFT JOIN public.usage_credit_balances ucb
    ON ucb.org_id = sub.id;
END;
$$;

GRANT ALL ON FUNCTION public.get_orgs_v6() TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v6() TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v6() TO service_role;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_orgs_v6(uuid) TO service_role;

-- Refresh cron job frequency for cron stats queue processing
SELECT cron.unschedule('process_cron_stats_queue');
SELECT cron.schedule(
  'process_cron_stats_queue',
  '*/4 * * * *',
  'SELECT public.process_function_queue(''cron_stats'')'
);

-- Ensure subscribed orgs are processed in deterministic (UUID ascending) order
CREATE OR REPLACE FUNCTION public.process_subscribed_orgs () RETURNS void LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
    ORDER BY o.id ASC
  )
  LOOP
    PERFORM pgmq.send('cron_plan',
      jsonb_build_object(
        'function_name', 'cron_plan',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$$;

ALTER FUNCTION public.process_subscribed_orgs () OWNER TO postgres;

-- Predict next stats update window for an organization.
-- NOTE: supabase postgres operates in UTC, matching pg_cron's timezone expectations.
CREATE OR REPLACE FUNCTION public.get_next_stats_update_date(org uuid)
RETURNS timestamp with time zone LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  cron_schedule constant text := '0 3 * * *';
  next_run timestamptz;
  preceding_count integer := 0;
  is_target boolean := false;
BEGIN
  next_run := public.get_next_cron_time(cron_schedule, now());

  WITH paying_orgs AS (
    SELECT o.id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
      AND (si.canceled_at IS NULL OR si.canceled_at > next_run)
      AND si.subscription_anchor_end > next_run
    ORDER BY o.id ASC
  )
  SELECT
    COUNT(*) FILTER (WHERE id < org)::int,
    COALESCE(BOOL_OR(id = org), false)
  INTO preceding_count, is_target
  FROM paying_orgs;

  IF NOT is_target THEN
    RETURN NULL;
  END IF;

  RETURN next_run + make_interval(mins => preceding_count * 4);
END;
$$;

ALTER FUNCTION public.get_next_stats_update_date(org uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_subscribed_orgs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscribed_orgs() TO service_role;
GRANT ALL ON FUNCTION public.get_next_stats_update_date(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_next_stats_update_date(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_next_stats_update_date(uuid) TO service_role;
