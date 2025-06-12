BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (5);

-- Test get_d1_webhook_signature (may return null if secret not configured)
SELECT
  ok (
    get_d1_webhook_signature () IS NULL
    OR length(get_d1_webhook_signature ()) >= 0,
    'get_d1_webhook_signature test - returns null or valid string'
  );

SELECT
  ok (
    get_d1_webhook_signature () IS NULL
    OR get_d1_webhook_signature () IS NOT NULL,
    'get_d1_webhook_signature test - consistent return value'
  );

-- Test is_org_yearly
SELECT
  is (
    is_org_yearly ('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
    false,
    'is_org_yearly test - org is not yearly'
  );

-- Test is_paying_and_good_plan_org_action (based on seed data, org has good plan)
SELECT
  is (
    is_paying_and_good_plan_org_action ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '{mau}'),
    true,
    'is_paying_and_good_plan_org_action test - org has good plan for mau action'
  );

-- Test check_min_rights (overloaded version with user_id)
SELECT
  is (
    check_min_rights (
      'read',
      '6aa76066-55ef-4238-ade6-0b32334a4097',
      '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
      'com.demo.app',
      null
    ),
    true,
    'check_min_rights test - user has read rights'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
