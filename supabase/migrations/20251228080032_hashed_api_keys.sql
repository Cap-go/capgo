-- ============================================================================
-- Hashed API Keys Migration
-- ============================================================================
-- This migration adds support for hashed API keys with organization-level
-- enforcement. Hashed keys are stored as SHA-256 hashes, with the plain key
-- only visible once during creation.
-- ============================================================================

-- ============================================================================
-- Section 1: Add key_hash column to apikeys table
-- ============================================================================

-- Add key_hash column for storing hashed API keys
ALTER TABLE "public"."apikeys"
ADD COLUMN IF NOT EXISTS "key_hash" text;

-- Add a partial index for efficient hash lookups
CREATE INDEX IF NOT EXISTS idx_apikeys_key_hash ON public.apikeys(key_hash)
WHERE key_hash IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN "public"."apikeys"."key_hash" IS 'SHA-256 hash of the API key. When set, the key column is cleared to null for security.';

-- ============================================================================
-- Section 2: Add enforce_hashed_api_keys column to orgs table
-- ============================================================================

-- Add organization-level enforcement setting
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "enforce_hashed_api_keys" boolean NOT NULL DEFAULT false;

-- Add comment to document the column
COMMENT ON COLUMN "public"."orgs"."enforce_hashed_api_keys" IS 'When true, only hashed API keys can access this organization. Plain-text keys will be rejected.';

-- ============================================================================
-- Section 3: Create hash verification function
-- ============================================================================

-- Function to verify if a plain key matches a stored hash
CREATE OR REPLACE FUNCTION "public"."verify_api_key_hash"(
  "plain_key" text,
  "stored_hash" text
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  RETURN encode(digest(plain_key, 'sha256'), 'hex') = stored_hash;
END;
$$;

ALTER FUNCTION "public"."verify_api_key_hash"(text, text) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."verify_api_key_hash"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."verify_api_key_hash"(text, text) TO "service_role";

-- ============================================================================
-- Section 4: Create function to find apikey by value (plain or hashed)
-- ============================================================================

-- Function to find apikey by plain key value (checks both plain and hashed)
CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"(
  "key_value" text
) RETURNS SETOF "public"."apikeys"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  found_key public.apikeys%ROWTYPE;
BEGIN
  -- First try plain-text lookup
  SELECT * INTO found_key FROM public.apikeys WHERE key = key_value LIMIT 1;
  IF FOUND THEN
    RETURN NEXT found_key;
    RETURN;
  END IF;

  -- Try hashed lookup
  SELECT * INTO found_key FROM public.apikeys
  WHERE key_hash = encode(digest(key_value, 'sha256'), 'hex')
  LIMIT 1;
  IF FOUND THEN
    RETURN NEXT found_key;
    RETURN;
  END IF;

  -- No key found
  RETURN;
END;
$$;

ALTER FUNCTION "public"."find_apikey_by_value"(text) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."find_apikey_by_value"(text) TO "anon";

-- ============================================================================
-- Section 5: Create function to check if org enforces hashed API keys
-- ============================================================================

-- Function to check if an org requires hashed API keys
CREATE OR REPLACE FUNCTION "public"."check_org_hashed_key_enforcement"(
  "org_id" uuid,
  "apikey_row" public.apikeys
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  org_enforcing boolean;
  is_hashed_key boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_hashed_api_keys INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_hashed_key_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce hashed keys, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this is a hashed key (key is null, key_hash is not null)
  is_hashed_key := (apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL);

  IF NOT is_hashed_key THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('org_id', org_id, 'apikey_id', apikey_row.id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."check_org_hashed_key_enforcement"(uuid, public.apikeys) OWNER TO "postgres";

-- Grant permissions
GRANT EXECUTE ON FUNCTION "public"."check_org_hashed_key_enforcement"(uuid, public.apikeys) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."check_org_hashed_key_enforcement"(uuid, public.apikeys) TO "service_role";

-- ============================================================================
-- Section 6: Update get_orgs_v7 to include enforce_hashed_api_keys
-- ============================================================================

-- Drop and recreate get_orgs_v7(userid uuid) to add enforce_hashed_api_keys field
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
    enforce_hashed_api_keys boolean
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
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys
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

-- ============================================================================
-- Section 7: Update get_orgs_v7() wrapper to match new signature
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
    enforce_hashed_api_keys boolean
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
-- Section 8: SQL Tests for Hashed API Key Functions
-- ============================================================================
-- These tests verify the hash functions work correctly during migration.
-- They use DO blocks to run inline tests that will fail the migration if broken.

DO $$
DECLARE
  test_plain_key text := 'test-api-key-12345';
  test_hash text;
  expected_hash text;
  found_key record;
  test_org_id uuid;
  test_user_id uuid;
  test_apikey_id bigint;
  enforcement_result boolean;
BEGIN
  -- ========================================
  -- Test 1: verify_api_key_hash function
  -- ========================================
  -- SHA-256 hash of 'test-api-key-12345' should be deterministic
  expected_hash := encode(digest(test_plain_key, 'sha256'), 'hex');

  -- Test that verification returns true for matching hash
  IF NOT public.verify_api_key_hash(test_plain_key, expected_hash) THEN
    RAISE EXCEPTION 'TEST FAILED: verify_api_key_hash should return true for matching key and hash';
  END IF;

  -- Test that verification returns false for non-matching hash
  IF public.verify_api_key_hash(test_plain_key, 'wronghash123') THEN
    RAISE EXCEPTION 'TEST FAILED: verify_api_key_hash should return false for non-matching hash';
  END IF;

  -- Test that verification returns false for wrong key
  IF public.verify_api_key_hash('wrong-key', expected_hash) THEN
    RAISE EXCEPTION 'TEST FAILED: verify_api_key_hash should return false for wrong key';
  END IF;

  RAISE NOTICE 'TEST PASSED: verify_api_key_hash function works correctly';

  -- ========================================
  -- Test 2: find_apikey_by_value function
  -- ========================================
  -- Get existing test user and org from seed data
  SELECT id INTO test_user_id FROM public.users WHERE email = 'test@capgo.app' LIMIT 1;
  SELECT id INTO test_org_id FROM public.orgs LIMIT 1;

  IF test_user_id IS NULL THEN
    RAISE NOTICE 'SKIPPING find_apikey_by_value tests: No test user found (seed data may not be loaded)';
  ELSE
    -- Create a test hashed API key
    INSERT INTO public.apikeys (user_id, key, key_hash, mode, name)
    VALUES (test_user_id, NULL, encode(digest('hashed-test-key-xyz', 'sha256'), 'hex'), 'read', 'Test Hashed Key')
    RETURNING id INTO test_apikey_id;

    -- Test finding by hashed key value
    SELECT * INTO found_key FROM public.find_apikey_by_value('hashed-test-key-xyz');
    IF found_key.id IS NULL THEN
      -- Cleanup
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      RAISE EXCEPTION 'TEST FAILED: find_apikey_by_value should find hashed key';
    END IF;

    IF found_key.id != test_apikey_id THEN
      -- Cleanup
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      RAISE EXCEPTION 'TEST FAILED: find_apikey_by_value returned wrong key';
    END IF;

    -- Test that wrong key value returns nothing
    SELECT * INTO found_key FROM public.find_apikey_by_value('non-existent-key-abc');
    IF found_key.id IS NOT NULL THEN
      -- Cleanup
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      RAISE EXCEPTION 'TEST FAILED: find_apikey_by_value should not find non-existent key';
    END IF;

    -- Cleanup test key
    DELETE FROM public.apikeys WHERE id = test_apikey_id;

    RAISE NOTICE 'TEST PASSED: find_apikey_by_value function works correctly';
  END IF;

  -- ========================================
  -- Test 3: check_org_hashed_key_enforcement function
  -- ========================================
  IF test_user_id IS NULL OR test_org_id IS NULL THEN
    RAISE NOTICE 'SKIPPING check_org_hashed_key_enforcement tests: No test data found';
  ELSE
    -- Create test keys for enforcement testing
    -- Plain key (not hashed)
    INSERT INTO public.apikeys (user_id, key, key_hash, mode, name)
    VALUES (test_user_id, 'plain-key-test-123', NULL, 'read', 'Test Plain Key')
    RETURNING id INTO test_apikey_id;

    -- Test with org that doesn't enforce hashed keys (default)
    UPDATE public.orgs SET enforce_hashed_api_keys = false WHERE id = test_org_id;

    SELECT * INTO found_key FROM public.apikeys WHERE id = test_apikey_id;
    enforcement_result := public.check_org_hashed_key_enforcement(test_org_id, found_key);
    IF NOT enforcement_result THEN
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      RAISE EXCEPTION 'TEST FAILED: Plain key should be allowed when org does not enforce hashed keys';
    END IF;

    -- Test with org that enforces hashed keys
    UPDATE public.orgs SET enforce_hashed_api_keys = true WHERE id = test_org_id;

    enforcement_result := public.check_org_hashed_key_enforcement(test_org_id, found_key);
    IF enforcement_result THEN
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      UPDATE public.orgs SET enforce_hashed_api_keys = false WHERE id = test_org_id;
      RAISE EXCEPTION 'TEST FAILED: Plain key should be rejected when org enforces hashed keys';
    END IF;

    -- Cleanup plain key
    DELETE FROM public.apikeys WHERE id = test_apikey_id;

    -- Create hashed key for testing
    INSERT INTO public.apikeys (user_id, key, key_hash, mode, name)
    VALUES (test_user_id, NULL, encode(digest('enforcement-test-key', 'sha256'), 'hex'), 'read', 'Test Enforcement Key')
    RETURNING id INTO test_apikey_id;

    SELECT * INTO found_key FROM public.apikeys WHERE id = test_apikey_id;
    enforcement_result := public.check_org_hashed_key_enforcement(test_org_id, found_key);
    IF NOT enforcement_result THEN
      DELETE FROM public.apikeys WHERE id = test_apikey_id;
      UPDATE public.orgs SET enforce_hashed_api_keys = false WHERE id = test_org_id;
      RAISE EXCEPTION 'TEST FAILED: Hashed key should be allowed when org enforces hashed keys';
    END IF;

    -- Cleanup
    DELETE FROM public.apikeys WHERE id = test_apikey_id;
    UPDATE public.orgs SET enforce_hashed_api_keys = false WHERE id = test_org_id;

    RAISE NOTICE 'TEST PASSED: check_org_hashed_key_enforcement function works correctly';
  END IF;

  RAISE NOTICE 'All SQL tests for hashed API keys passed successfully!';
END;
$$;
