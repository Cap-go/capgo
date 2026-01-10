-- ============================================================================
-- Enforce Encrypted Bundles for Organizations
-- ============================================================================
-- This migration adds support for enforcing encrypted bundles at the
-- organization level. When enabled, all bundles uploaded to apps in the
-- organization must include encryption data (session_key).
--
-- Optional: Organizations can also require a specific encryption key by
-- setting required_encryption_key (first 21 chars of public key). When set,
-- only bundles encrypted with that specific key will be accepted.
-- ============================================================================

-- ============================================================================
-- Section 1: Add enforce_encrypted_bundles and required_encryption_key columns
-- ============================================================================

-- Add organization-level enforcement setting
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "enforce_encrypted_bundles" boolean NOT NULL DEFAULT false;

-- Add optional required encryption key fingerprint (first 21 chars of base64 public key)
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "required_encryption_key" character varying(21) DEFAULT NULL;

-- Add comments to document the columns
COMMENT ON COLUMN "public"."orgs"."enforce_encrypted_bundles" IS 'When true, all bundles uploaded to this organization must be encrypted (have session_key set). Unencrypted bundles will be rejected.';
COMMENT ON COLUMN "public"."orgs"."required_encryption_key" IS 'Optional: First 21 characters of the base64-encoded public key. When set, only bundles encrypted with this specific key (matching key_id) will be accepted.';

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
  org_id uuid;
  org_enforcing boolean;
  org_required_key varchar(21);
  bundle_is_encrypted boolean;
  bundle_key_id varchar(20);
BEGIN
  -- Derive org_id from app_id directly to avoid trigger ordering issues.
  -- The force_valid_owner_org_app_versions trigger runs after this one
  -- (alphabetically), so NEW.owner_org may not be populated yet.
  -- We look up the org from the apps table using the app_id.
  IF NEW.owner_org IS NOT NULL THEN
    org_id := NEW.owner_org;
  ELSE
    SELECT apps.owner_org INTO org_id
    FROM public.apps
    WHERE apps.app_id = NEW.app_id;
  END IF;

  -- If org not found, allow (will fail on other checks)
  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the org's enforcement settings
  SELECT enforce_encrypted_bundles, required_encryption_key
  INTO org_enforcing, org_required_key
  FROM public.orgs
  WHERE id = org_id;

  -- If org doesn't exist or doesn't enforce encrypted bundles, allow
  IF org_enforcing IS NULL OR org_enforcing = false THEN
    RETURN NEW;
  END IF;

  -- Check if this bundle is encrypted (has a non-empty session_key)
  bundle_is_encrypted := NEW.session_key IS NOT NULL AND NEW.session_key <> '';
  bundle_key_id := NEW.key_id;

  IF NOT bundle_is_encrypted THEN
    -- Log the rejection for audit
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES_TRIGGER',
      jsonb_build_object(
        'org_id', org_id,
        'app_id', NEW.app_id,
        'version_name', NEW.name,
        'user_id', NEW.user_id,
        'reason', 'not_encrypted'
      ));
    RAISE EXCEPTION 'encryption_required: This organization requires all bundles to be encrypted. Please upload an encrypted bundle with a session_key.';
  END IF;

  -- If org requires a specific key, check the key_id matches
  IF org_required_key IS NOT NULL AND org_required_key <> '' THEN
    -- Bundle must have a key_id that starts with the required key fingerprint
    IF bundle_key_id IS NULL OR bundle_key_id = '' THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'missing_key_id'
        ));
      RAISE EXCEPTION 'encryption_key_required: This organization requires bundles to be encrypted with a specific key. The uploaded bundle does not have a key_id.';
    END IF;

    -- Check if the bundle's key_id starts with the required key fingerprint
    -- We use starts_with because key_id is 20 chars and required_encryption_key is up to 21 chars
    IF NOT (bundle_key_id = LEFT(org_required_key, 20) OR LEFT(bundle_key_id, LENGTH(org_required_key)) = org_required_key) THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'key_mismatch'
        ));
      RAISE EXCEPTION 'encryption_key_mismatch: This organization requires bundles to be encrypted with a specific key. The uploaded bundle was encrypted with a different key.';
    END IF;
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
    enforce_encrypted_bundles boolean,
    required_encryption_key character varying
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
      -- should_redact_2fa: true if org enforces 2FA and user doesn't have 2FA
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN public.org_users ou ON ou.user_id = userid AND o.id = ou.org_id
  ),
  -- Calculate password policy access status for user/org combinations
  password_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS "password_has_access",
      -- should_redact_password: true if org has policy and user doesn't meet it
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
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN false
      ELSE (si.status = 'succeeded')
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - now()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN false
      ELSE ((si.status = 'succeeded' AND si.is_good_plan = true) OR (si.trial_at::date - now()::date > 0))
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN false
      ELSE (si.status = 'canceled')
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR pa.should_redact_password THEN false
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
    o.enforce_encrypted_bundles,
    o.required_encryption_key
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
    enforce_encrypted_bundles boolean,
    required_encryption_key character varying
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

-- ============================================================================
-- Section 7: Functions for counting and deleting non-compliant bundles
-- ============================================================================
-- These functions are used when enabling encryption enforcement to:
-- 1. Count how many bundles would be affected (for UI warning)
-- 2. Mark non-compliant bundles as deleted when enforcement is enabled

-- Function to count non-compliant bundles for an organization
-- Returns the count of bundles that would be marked as deleted if enforcement is enabled
-- SECURITY: Caller must be a super_admin of the organization
CREATE OR REPLACE FUNCTION "public"."count_non_compliant_bundles"(
  "org_id" uuid,
  "required_key" text DEFAULT NULL
) RETURNS TABLE (
  non_encrypted_count bigint,
  wrong_key_count bigint,
  total_non_compliant bigint
)
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  non_encrypted bigint := 0;
  wrong_key bigint := 0;
  caller_user_id uuid;
  caller_right public.user_min_right;
BEGIN
  -- Get the current user's ID (supports both JWT and API key authentication)
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Check if the caller is a super_admin of this organization
  SELECT user_right INTO caller_right
  FROM public.org_users
  WHERE org_users.user_id = caller_user_id
    AND org_users.org_id = count_non_compliant_bundles.org_id;

  IF caller_right IS NULL OR caller_right <> 'super_admin'::public.user_min_right THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  -- Count bundles without encryption (no session_key)
  SELECT COUNT(*) INTO non_encrypted
  FROM public.app_versions av
  JOIN public.apps a ON a.app_id = av.app_id
  WHERE a.owner_org = count_non_compliant_bundles.org_id
    AND av.deleted = false
    AND (av.session_key IS NULL OR av.session_key = '');

  -- Count bundles with wrong key (if required_key is specified)
  IF required_key IS NOT NULL AND required_key <> '' THEN
    SELECT COUNT(*) INTO wrong_key
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = count_non_compliant_bundles.org_id
      AND av.deleted = false
      AND av.session_key IS NOT NULL
      AND av.session_key <> ''
      AND (
        av.key_id IS NULL
        OR av.key_id = ''
        OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
      );
  END IF;

  RETURN QUERY SELECT non_encrypted, wrong_key, (non_encrypted + wrong_key);
END;
$$;

ALTER FUNCTION "public"."count_non_compliant_bundles"(uuid, text) OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."count_non_compliant_bundles"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."count_non_compliant_bundles"(uuid, text) TO "service_role";

-- Function to mark non-compliant bundles as deleted when enabling enforcement
-- This is called when the user confirms they want to enable enforcement
-- Returns the number of bundles that were marked as deleted
-- SECURITY: Caller must be a super_admin of the organization
CREATE OR REPLACE FUNCTION "public"."delete_non_compliant_bundles"(
  "org_id" uuid,
  "required_key" text DEFAULT NULL
) RETURNS bigint
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
  caller_right public.user_min_right;
BEGIN
  -- Get the current user's ID (supports both JWT and API key authentication)
  SELECT public.get_identity('{read,upload,write,all}'::public.key_mode[]) INTO caller_user_id;

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Check if the caller is a super_admin of this organization
  SELECT user_right INTO caller_right
  FROM public.org_users
  WHERE org_users.user_id = caller_user_id
    AND org_users.org_id = delete_non_compliant_bundles.org_id;

  IF caller_right IS NULL OR caller_right <> 'super_admin'::public.user_min_right THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  -- First, collect all bundle IDs that will be deleted
  IF required_key IS NULL OR required_key = '' THEN
    -- Only delete non-encrypted bundles
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    -- Delete non-encrypted bundles AND bundles with wrong key
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        -- Non-encrypted bundles
        (av.session_key IS NULL OR av.session_key = '')
        OR
        -- Encrypted but with wrong key
        (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  -- If there are bundles to delete, mark them as deleted
  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    -- Log the action
    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;

ALTER FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) OWNER TO "postgres";

-- Grant to authenticated role (with authorization checks inside the function)
GRANT EXECUTE ON FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_non_compliant_bundles"(uuid, text) TO "service_role";
