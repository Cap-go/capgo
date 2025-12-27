-- ============================================================================
-- Section 1: has_2fa_enabled functions
-- ============================================================================

-- Function to check if the current user has 2FA enabled
CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the current user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors
    WHERE (SELECT auth.uid()) = user_id 
      AND status = 'verified'
  );
END;
$$;

ALTER FUNCTION "public"."has_2fa_enabled"() OWNER TO "postgres";

-- Function to check if a specific user has 2FA enabled
-- This function is SECURITY DEFINER to allow backend/service_role access only
CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the specified user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors mfa
    WHERE mfa.user_id = has_2fa_enabled.user_id 
      AND mfa.status = 'verified'
  );
END;
$$;

ALTER FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") OWNER TO "postgres";

-- Grant permissions
-- The no-argument version should be accessible to authenticated users
GRANT EXECUTE ON FUNCTION "public"."has_2fa_enabled"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."has_2fa_enabled"() TO "anon";

-- The user_id version should only be accessible to service_role and postgres (backend)
-- Revoke all permissions from PUBLIC, anon, and authenticated first
REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid")
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid")
FROM
  "anon";

REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid")
FROM
  "authenticated";

-- Grant execution permission only to postgres and service_role
GRANT EXECUTE ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") TO "service_role";

-- ============================================================================
-- Section 2: check_org_members_2fa_enabled function
-- ============================================================================

-- Function to check 2FA status for all members of an organization
-- This function is accessible only to super_admins of the organization
CREATE OR REPLACE FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") 
    RETURNS TABLE (
        "user_id" "uuid",
        "2fa_enabled" boolean
    )
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_2fa_enabled.org_id) THEN
        RAISE EXCEPTION 'Organization does not exist';
    END IF;

    -- Check if the current user is a super_admin of the organization
    IF NOT (
        public.check_min_rights(
            'super_admin'::public.user_min_right,
            (SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], check_org_members_2fa_enabled.org_id)),
            check_org_members_2fa_enabled.org_id,
            NULL::character varying,
            NULL::bigint
        )
    ) THEN
        RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    -- Return list of org members with their 2FA status
    RETURN QUERY
    SELECT 
        ou.user_id,
        COALESCE(public.has_2fa_enabled(ou.user_id), false) AS "2fa_enabled"
    FROM public.org_users ou
    WHERE ou.org_id = check_org_members_2fa_enabled.org_id;
END;
$$;

ALTER FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") OWNER TO "postgres";

-- Grant permissions - accessible to authenticated users (permission check is inside the function)
GRANT EXECUTE ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "service_role";

-- ============================================================================
-- Section 3: Add enforcing_2fa column to orgs table
-- ============================================================================

-- Add enforcing_2fa boolean column to orgs table (defaults to false)
ALTER TABLE "public"."orgs" 
ADD COLUMN IF NOT EXISTS "enforcing_2fa" boolean NOT NULL DEFAULT false;

-- Add comment to document the column
COMMENT ON COLUMN "public"."orgs"."enforcing_2fa" IS 'When true, all members of this organization must have 2FA enabled to access the organization';

-- ============================================================================
-- Section 4: Modify check_min_rights to enforce 2FA
-- ============================================================================

-- Modify check_min_rights to check 2FA enforcement rules
-- If org has enforcing_2fa enabled and user doesn't have 2FA, deny access
CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    user_right_record RECORD;
    org_enforcing_2fa boolean;
BEGIN
    IF user_id IS NULL THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_NO_UID', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text));
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = check_min_rights.org_id;

    -- If org enforces 2FA and user doesn't have 2FA enabled, deny access
    IF org_enforcing_2fa = true AND NOT public.has_2fa_enabled(user_id) THEN
        PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS_2FA_ENFORCEMENT', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
        RETURN false;
    END IF;

    FOR user_right_record IN
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id
        FROM public.org_users
        WHERE org_users.org_id = check_min_rights.org_id AND org_users.user_id = check_min_rights.user_id
    LOOP
        IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id = check_min_rights.channel_id)
        THEN
            RETURN true;
        END IF;
    END LOOP;

    PERFORM public.pg_log('deny: CHECK_MIN_RIGHTS', jsonb_build_object('org_id', org_id, 'app_id', app_id, 'channel_id', channel_id, 'min_right', min_right::text, 'user_id', user_id));
    RETURN false;
END;
$$;

-- ============================================================================
-- Section 4.A: Create get_orgs_v7 with 2FA enforcement
-- ============================================================================

-- Create get_orgs_v7(userid uuid) - adds enforcing_2fa and 2fa_has_access fields
-- Redacts sensitive information when user doesn't have 2FA access
CREATE FUNCTION public.get_orgs_v7(userid uuid)
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
    enforcing_2fa boolean,
    "2fa_has_access" boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) as cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  -- Compute next stats update info for all paying orgs at once
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 as preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > now())
        AND si.subscription_anchor_end > now())
      OR si.trial_at > now()
    )
  ),
  -- Calculate current billing cycle for each org
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > now() - date_trunc('MONTH', now())
        THEN date_trunc('MONTH', now() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', now())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      -- 2fa_has_access: true if enforcing_2fa is false OR (enforcing_2fa is true AND user has 2FA)
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      -- should_redact: true if org enforces 2FA and user doesn't have 2FA
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- Redact sensitive fields if user doesn't have 2FA access
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - now()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - now()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', now()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access"
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v7(uuid) OWNER TO "postgres";

-- Revoke from public roles (security: prevents users from querying other users' orgs)
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM "anon";
REVOKE ALL ON FUNCTION public.get_orgs_v7(uuid) FROM "authenticated";

-- Grant only to postgres and service_role (private function)
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(uuid) TO "service_role";

-- Create get_orgs_v7() - wrapper function
CREATE OR REPLACE FUNCTION public.get_orgs_v7()
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
    enforcing_2fa boolean,
    "2fa_has_access" boolean
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

ALTER FUNCTION public.get_orgs_v7() OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_orgs_v7() TO "anon";
GRANT ALL ON FUNCTION public.get_orgs_v7() TO "authenticated";
GRANT ALL ON FUNCTION public.get_orgs_v7() TO "service_role";

-- ============================================================================
-- Section 4.B: Modify get_orgs_v6 to prevent information leakage
-- ============================================================================

-- Modify get_orgs_v6(userid uuid) to redact sensitive information when user doesn't have 2FA access
DROP FUNCTION IF EXISTS public.get_orgs_v6(uuid);

CREATE FUNCTION public.get_orgs_v6(userid uuid)
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
    credit_next_expiration timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
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
        AND (si.canceled_at IS NULL OR si.canceled_at > now())
        AND si.subscription_anchor_end > now())
      OR si.trial_at > now()
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
             > now() - date_trunc('MONTH', now())
        THEN date_trunc('MONTH', now() - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', now())
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS cycle_start
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  -- Calculate 2FA access status for user/org combinations
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      -- should_redact: true if org enforces 2FA and user doesn't have 2FA
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    o.logo,
    o.name,
    ou.user_right::varchar AS role,
    -- Redact sensitive fields if user doesn't have 2FA access
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - now()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - now()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', now()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    COALESCE(ucb.available_credits, 0) AS credit_available,
    COALESCE(ucb.total_credits, 0) AS credit_total,
    ucb.next_expiration AS credit_next_expiration
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;

ALTER FUNCTION public.get_orgs_v6(uuid) OWNER TO "postgres";

-- Revoke from public roles (security: prevents users from querying other users' orgs)
REVOKE ALL ON FUNCTION public.get_orgs_v6(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v6(uuid) FROM "anon";
REVOKE ALL ON FUNCTION public.get_orgs_v6(uuid) FROM "authenticated";

-- Grant only to postgres and service_role (private function)
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(uuid) TO "service_role";

-- ============================================================================
-- Section 5: reject_access_due_to_2fa function
-- ============================================================================

-- Function to check if access should be rejected due to 2FA enforcement
-- Returns true if org requires 2FA and user doesn't have it, false otherwise
-- This function is private (accessible only to backend/service_role)
CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") 
    RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_enforcing_2fa boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = reject_access_due_to_2fa.org_id) THEN
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_2fa.org_id;

    -- 7.1 If a given org does not enable 2FA enforcement, return false
    IF org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- 7.2 If a given org REQUIRES 2FA, and has_2fa_enabled(user_id) == false, return true
    IF org_enforcing_2fa = true AND NOT public.has_2fa_enabled(reject_access_due_to_2fa.user_id) THEN
        PERFORM public.pg_log('deny: REJECT_ACCESS_DUE_TO_2FA', jsonb_build_object('org_id', org_id, 'user_id', user_id));
        RETURN true;
    END IF;

    -- 7.3 Otherwise, return false
    RETURN false;
END;
$$;

ALTER FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") OWNER TO "postgres";

-- Revoke all permissions from PUBLIC, anon, and authenticated (private function)
REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid")
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid")
FROM
  "anon";

REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid")
FROM
  "authenticated";

-- Grant execution permission only to postgres and service_role
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") TO "service_role";
