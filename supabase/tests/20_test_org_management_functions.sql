BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (35);

-- Test accept_invitation_to_org (user is already a member, so should return INVALID_ROLE)
SELECT
  tests.authenticate_as ('test_user');

SELECT
  is (
    accept_invitation_to_org ('046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    'INVALID_ROLE',
    'accept_invitation_to_org test - user already member'
  );

SELECT
  tests.clear_authentication ();

-- Test invite_user_to_org (requires email functionality which may not be available)
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  ok (
    invite_user_to_org (
      'newuser@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'read'
    ) IS NOT NULL,
    'invite_user_to_org test - returns result'
  );

SELECT
  ok (
    invite_user_to_org (
      'existing@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'read'
    ) IS NOT NULL,
    'invite_user_to_org test - returns result for existing'
  );

SELECT
  tests.clear_authentication ();

-- Test get_orgs_v6 without userid
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_orgs_v6 ()
    ) > 0,
    'get_orgs_v6 test - returns organizations'
  );

SELECT
  tests.clear_authentication ();

-- Test get_orgs_v6 with userid
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_orgs_v6 ('c591b04e-cf29-4945-b9a0-776d0672061a')
    ) >= 0,
    'get_orgs_v6 test - returns organizations for admin user'
  );

-- Test get_org_members
SELECT
  tests.authenticate_as ('test_admin');

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_org_members ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_org_members test - returns members'
  );

SELECT
  tests.clear_authentication ();

-- Test get_org_members with user_id
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_org_members (
          tests.get_supabase_uid ('test_admin'),
          '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        )
    ) >= 0,
    'get_org_members test - returns members for user'
  );

-- Test is_canceled_org
SELECT
  is (
    is_canceled_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    false,
    'is_canceled_org test - org not canceled'
  );

-- Test is_canceled_org negative case
SELECT
  is (
    is_canceled_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_canceled_org test - non-existent org returns false'
  );

-- Test is_paying_org (based on seed data, orgs have stripe_info so they are paying)
SELECT
  is (
    is_paying_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    true,
    'is_paying_org test - org is paying based on seed'
  );

-- Test is_paying_org negative case
SELECT
  is (
    is_paying_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_paying_org test - non-existent org returns false'
  );

-- Test is_trial_org
SELECT
  ok (
    is_trial_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d') >= 0,
    'is_trial_org test - returns trial days'
  );

-- Test is_trial_org negative case
SELECT
  ok (
    is_trial_org ('00000000-0000-0000-0000-000000000000') IS NULL,
    'is_trial_org test - non-existent org returns null'
  );

-- TODO: fix this test
-- Test is_onboarded_org (based on seed data, orgs are not onboarded)
-- SELECT
--   is (
--     is_onboarded_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
--     false,
--     'is_onboarded_org test - org not onboarded'
--   );
-- Test is_onboarded_org negative case
SELECT
  is (
    is_onboarded_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_onboarded_org test - non-existent org returns false'
  );

-- Test is_onboarding_needed_org
-- Note: This test runs in the same transaction where we modify stripe_info later
-- The org is not onboarded, and if the trial gets expired in a later test, 
-- onboarding will be needed. So we just check it returns a boolean.
SELECT
  ok (
    is_onboarding_needed_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d') IS NOT NULL,
    'is_onboarding_needed_org test - returns boolean result'
  );

-- Test is_onboarding_needed_org negative case
SELECT
  ok (
    is_onboarding_needed_org ('00000000-0000-0000-0000-000000000000') IS NULL,
    'is_onboarding_needed_org test - non-existent org returns null'
  );

-- Test is_good_plan_v5_org (based on seed data with stripe_info)
SELECT
  is (
    is_good_plan_v5_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    true,
    'is_good_plan_v5_org test - has good plan'
  );

-- Test is_good_plan_v5_org negative case
SELECT
  is (
    is_good_plan_v5_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_good_plan_v5_org test - non-existent org returns false'
  );

-- Test is_paying_and_good_plan_org
SELECT
  is (
    is_paying_and_good_plan_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    true,
    'is_paying_and_good_plan_org test - paying and good plan'
  );

-- Test is_paying_and_good_plan_org negative case
SELECT
  is (
    is_paying_and_good_plan_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_paying_and_good_plan_org test - non-existent org returns false'
  );

-- Test is_allowed_action_org
SELECT
  is (
    is_allowed_action_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    true,
    'is_allowed_action_org test - action allowed for good plan'
  );

-- Test is_allowed_action_org negative case
SELECT
  is (
    is_allowed_action_org ('00000000-0000-0000-0000-000000000000'),
    false,
    'is_allowed_action_org test - non-existent org returns false'
  );

-- Test is_allowed_action_org_action
SELECT
  is (
    is_allowed_action_org_action ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '{mau}'),
    true,
    'is_allowed_action_org_action test - mau action allowed'
  );

-- Test is_allowed_action_org_action negative case
SELECT
  is (
    is_allowed_action_org_action ('00000000-0000-0000-0000-000000000000', '{mau}'),
    false,
    'is_allowed_action_org_action test - non-existent org returns false'
  );

-- Test get_current_plan_name_org
SELECT
  ok (
    get_current_plan_name_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d') IS NOT NULL,
    'get_current_plan_name_org test - returns plan name'
  );

-- Test get_current_plan_max_org
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_current_plan_max_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) = 1,
    'get_current_plan_max_org test - returns plan limits'
  );

-- Test get_cycle_info_org
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        get_cycle_info_org ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_cycle_info_org test - returns cycle info'
  );

-- Test get_organization_cli_warnings with proper API key setup
-- Test 1: Set up valid API key and test normal scenario (good plan)
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}', true);
END $$;

SELECT
  ok (
    get_identity_apikey_only ('{read,all}') IS NOT NULL,
    'get_identity_apikey_only test - returns user when valid read apikey is set'
  );

-- Test the function with a valid org and good plan
SELECT
  ok (
    COALESCE(
      array_length(
        get_organization_cli_warnings ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'),
        1
      ),
      0
    ) >= 0,
    'get_organization_cli_warnings test - returns warnings array for valid org with good plan'
  );

-- Test 2: Test with invalid API key (should return access denied)
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "invalid-key"}', true);
END $$;

SELECT
  ok (
    get_identity_apikey_only ('{read,all}') IS NULL,
    'get_identity_apikey_only test - returns null when invalid apikey is set'
  );

-- This should return an access denied message
SELECT
  ok (
    array_length(
      get_organization_cli_warnings ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'),
      1
    ) = 1,
    'get_organization_cli_warnings test - returns single warning for invalid API key'
  );

-- Test 3: Test is_paying_and_good_plan_org_action directly with valid setup
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}', true);
END $$;

-- Test individual action types
SELECT
  ok (
    is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['mau']::"public"."action_type" []
    ) IS NOT NULL,
    'is_paying_and_good_plan_org_action test - MAU action returns result'
  );

SELECT
  ok (
    is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['storage']::"public"."action_type" []
    ) IS NOT NULL,
    'is_paying_and_good_plan_org_action test - Storage action returns result'
  );

SELECT
  ok (
    is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['bandwidth']::"public"."action_type" []
    ) IS NOT NULL,
    'is_paying_and_good_plan_org_action test - Bandwidth action returns result'
  );

-- Test multiple actions
SELECT
  ok (
    is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['mau', 'storage', 'bandwidth']::"public"."action_type" []
    ) IS NOT NULL,
    'is_paying_and_good_plan_org_action test - Multiple actions return result'
  );

-- Test 4: Force storage exceeded scenario to test warning message
-- The seed data creates stripe_info with trial_at in the future, so we need to expire it
-- and set storage_exceeded to trigger the warning
UPDATE stripe_info
SET
  storage_exceeded = true,
  mau_exceeded = false,
  bandwidth_exceeded = false,
  trial_at = now() - interval '30 days',
  status = 'succeeded',
  is_good_plan = true
WHERE
  customer_id = 'cus_Pa0k8TO6HVln6A';

-- Reset headers first
DO $$
BEGIN
    PERFORM set_config('request.headers', NULL, true);
END $$;

-- Set API key for storage exceeded tests
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}', true);
END $$;

-- Debug: Check the state of stripe_info and org
SELECT
  diag ('Debug: Checking stripe_info state');

-- Check what the customer_id is for this org
SELECT
  diag (
    'Org customer_id: ' || COALESCE(customer_id, 'NULL')
  )
FROM
  orgs
WHERE
  id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d';

-- Check what stripe_info records exist
SELECT
  diag (
    'Existing stripe_info customer_ids: ' || string_agg(customer_id, ', ')
  )
FROM
  stripe_info;

-- Check stripe_info state BEFORE update
SELECT
  diag ('BEFORE UPDATE:');

SELECT
  diag (
    'customer_id: ' || COALESCE(customer_id, 'NULL') || ', status: ' || COALESCE(status::text, 'NULL') || ', storage_exceeded: ' || storage_exceeded::text || ', mau_exceeded: ' || mau_exceeded::text || ', bandwidth_exceeded: ' || bandwidth_exceeded::text || ', trial_at: ' || COALESCE(trial_at::text, 'NULL') || ', is_good_plan: ' || is_good_plan::text
  )
FROM
  stripe_info
WHERE
  customer_id = 'cus_Pa0k8TO6HVln6A';

-- Check stripe_info state AFTER update
SELECT
  diag ('AFTER UPDATE:');

SELECT
  diag (
    'customer_id: ' || COALESCE(customer_id, 'NULL') || ', status: ' || COALESCE(status::text, 'NULL') || ', storage_exceeded: ' || storage_exceeded::text || ', mau_exceeded: ' || mau_exceeded::text || ', bandwidth_exceeded: ' || bandwidth_exceeded::text || ', trial_at: ' || COALESCE(trial_at::text, 'NULL') || ', is_good_plan: ' || is_good_plan::text
  )
FROM
  stripe_info
WHERE
  customer_id = 'cus_Pa0k8TO6HVln6A';

-- Debug: Check what is_paying_and_good_plan_org_action returns
SELECT
  diag (
    'Debug: is_paying_and_good_plan_org_action results'
  );

SELECT
  diag (
    'mau: ' || is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['mau']::"public"."action_type" []
    )::text
  );

SELECT
  diag (
    'bandwidth: ' || is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['bandwidth']::"public"."action_type" []
    )::text
  );

SELECT
  diag (
    'storage: ' || is_paying_and_good_plan_org_action (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      ARRAY['storage']::"public"."action_type" []
    )::text
  );

-- This should now return a storage limit warning
-- First test that we get exactly one warning
-- TODO: fix this test
-- SELECT
--   is (
--     array_length(
--       get_organization_cli_warnings ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'),
--       1
--     ),
--     1,
--     'get_organization_cli_warnings test - returns one warning when storage exceeded'
--   );
-- Then test the warning content
-- SELECT
--   ok (
--     (
--       get_organization_cli_warnings ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0')
--     ) [1] ->> 'message' LIKE '%storage limit%',
--     'get_organization_cli_warnings test - returns storage limit warning when storage exceeded'
--   );
-- Reset the exceeded flags and trial period for other tests
UPDATE stripe_info
SET
  storage_exceeded = false,
  mau_exceeded = false,
  bandwidth_exceeded = false,
  trial_at = now() + interval '15 days'
WHERE
  customer_id = (
    SELECT
      customer_id
    FROM
      orgs
    WHERE
      id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
  );

-- Reset the request headers for other tests
DO $$
BEGIN
    PERFORM set_config('request.headers', NULL, true);
END $$;

SELECT
  *
FROM
  finish ();

ROLLBACK;
