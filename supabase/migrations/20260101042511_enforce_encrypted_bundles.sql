-- ============================================================================
-- Enforce Encrypted Bundles for Organizations
-- ============================================================================
-- This migration adds support for enforcing encrypted bundles at the
-- organization level. When enabled, all bundles uploaded to apps in the
-- organization must include encryption data (session_key).
-- ============================================================================

-- ============================================================================
-- Section 1: Add enforce_encrypted_bundles column to orgs table
-- ============================================================================

-- Add organization-level enforcement setting
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "enforce_encrypted_bundles" boolean NOT NULL DEFAULT false;

-- Add comment to document the column
COMMENT ON COLUMN "public"."orgs"."enforce_encrypted_bundles" IS 'When true, all bundles uploaded to this organization must be encrypted (have session_key set). Unencrypted bundles will be rejected.';

-- ============================================================================
-- Section 2: Create helper function to check if a bundle is encrypted
-- ============================================================================

-- Function to check if a bundle (app_version) is encrypted
CREATE OR REPLACE FUNCTION "public"."is_bundle_encrypted"(
  "session_key" text
) RETURNS boolean
LANGUAGE "plpgsql" IMMUTABLE
SET "search_path" TO ''
AS $$
BEGIN
  -- A bundle is considered encrypted if it has a non-empty session_key
  RETURN session_key IS NOT NULL AND session_key <> '';
END;
$$;

ALTER FUNCTION "public"."is_bundle_encrypted"(text) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."is_bundle_encrypted"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_bundle_encrypted"(text) TO "service_role";

-- ============================================================================
-- Section 3: Create function to check org encryption enforcement
-- ============================================================================

-- Function to check if an org requires encrypted bundles
-- Returns true if upload should be allowed, false if it should be rejected
CREATE OR REPLACE FUNCTION "public"."check_org_encrypted_bundle_enforcement"(
  "org_id" uuid,
  "session_key" text
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  org_enforcing boolean;
  is_encrypted boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_encrypted_bundles INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_encrypted_bundle_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce encrypted bundles, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this bundle is encrypted
  is_encrypted := public.is_bundle_encrypted(session_key);

  IF NOT is_encrypted THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES',
      jsonb_build_object('org_id', org_id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_org_encrypted_bundle_enforcement"(uuid, text) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"(uuid, text) TO "service_role";

-- ============================================================================
-- Section 4: Database Trigger to Enforce Encrypted Bundles on INSERT
-- ============================================================================
-- This trigger runs BEFORE INSERT on app_versions to enforce encrypted bundles
-- at the database level, preventing bypass through direct SDK inserts.

CREATE OR REPLACE FUNCTION "public"."check_encrypted_bundle_on_insert"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_enforcing boolean;
  bundle_is_encrypted boolean;
BEGIN
  -- Get the org's enforcement setting for this app
  SELECT enforce_encrypted_bundles INTO org_enforcing
  FROM public.orgs
  WHERE id = NEW.owner_org;

  -- If org doesn't exist or doesn't enforce encrypted bundles, allow
  IF org_enforcing IS NULL OR org_enforcing = false THEN
    RETURN NEW;
  END IF;

  -- Check if this bundle is encrypted (has a non-empty session_key)
  bundle_is_encrypted := NEW.session_key IS NOT NULL AND NEW.session_key <> '';

  IF NOT bundle_is_encrypted THEN
    -- Log the rejection for audit
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES_TRIGGER',
      jsonb_build_object(
        'org_id', NEW.owner_org,
        'app_id', NEW.app_id,
        'version_name', NEW.name,
        'user_id', NEW.user_id
      ));
    RAISE EXCEPTION 'encryption_required: This organization requires all bundles to be encrypted. Please upload an encrypted bundle with a session_key.';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."check_encrypted_bundle_on_insert"() OWNER TO "postgres";

-- Create the trigger on app_versions table
DROP TRIGGER IF EXISTS enforce_encrypted_bundle_trigger ON public.app_versions;

CREATE TRIGGER enforce_encrypted_bundle_trigger
  BEFORE INSERT ON public.app_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_encrypted_bundle_on_insert();

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "service_role";

-- ============================================================================
-- Section 5: Update get_orgs_v7 to include enforce_encrypted_bundles
-- ============================================================================

-- Drop and recreate get_orgs_v7(userid uuid) to add enforce_encrypted_bundles field
DROP FUNCTION IF EXISTS public.get_orgs_v7(uuid);

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
    "2fa_has_access" boolean,
    enforce_hashed_api_keys boolean,
    password_policy_config jsonb,
    password_has_access boolean,
    require_apikey_expiration boolean,
    max_apikey_expiration_days integer,
    enforce_encrypted_bundles boolean
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
  ),
  -- Calculate password policy access status for user/org combinations
  password_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS "password_has_access"
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
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    pa.password_policy_config,
    pa."password_has_access",
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles
  FROM public.orgs o
  JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  JOIN two_fa_access tfa ON tfa.org_id = o.id
  JOIN password_access pa ON pa.org_id = o.id
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

-- ============================================================================
-- Section 6: Update get_orgs_v7() wrapper to match new signature
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_orgs_v7();

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
    "2fa_has_access" boolean,
    enforce_hashed_api_keys boolean,
    password_policy_config jsonb,
    password_has_access boolean,
    require_apikey_expiration boolean,
    max_apikey_expiration_days integer,
    enforce_encrypted_bundles boolean
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
    SELECT * FROM public.find_apikey_by_value(api_key_text) INTO api_key;

    IF api_key IS NULL THEN
      PERFORM public.pg_log('deny: INVALID_API_KEY', jsonb_build_object('source', 'header'));
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    -- Check if API key is expired
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

ALTER FUNCTION public.get_orgs_v7() OWNER TO "postgres";

GRANT ALL ON FUNCTION public.get_orgs_v7() TO "anon";
GRANT ALL ON FUNCTION public.get_orgs_v7() TO "authenticated";
GRANT ALL ON FUNCTION public.get_orgs_v7() TO "service_role";
