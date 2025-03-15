BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(12);

-- Test check_min_rights with super_admin role (replacing is_owner_of_org)
SELECT
    is(check_min_rights('super_admin'::user_min_right, tests.get_supabase_uid('test_admin'), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', NULL::character varying, NULL::bigint), true, 'check_min_rights test - admin has super_admin rights');
SELECT
    is(check_min_rights('super_admin'::user_min_right, tests.get_supabase_uid('test_user'), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', NULL::character varying, NULL::bigint), false, 'check_min_rights test - regular user does not have super_admin rights');

-- Test is_member_of_org
SELECT
    is(is_member_of_org(tests.get_supabase_uid('test_admin'), '22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_member_of_org test - user is member');
SELECT
    is(is_member_of_org(tests.get_supabase_uid('test_user'), '22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_member_of_org test - user is not member');

-- Test is_paying_org
SELECT
    is(is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_paying_org test - org is paying');
SELECT
    is(is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6e'), false, 'is_paying_org test - org does not exist');

-- Test is_trial_org
SELECT
    is(is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), 15, 'is_trial_org test - org is in trial');
SELECT
    is(is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6e'), null, 'is_trial_org test - org does not exist');

-- Test is_onboarded_org
SELECT
    is(is_onboarded_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'), true, 'is_onboarded_org test - org is onboarded');
SELECT
    is(is_onboarded_org('22dbad8a-b885-4309-9b3b-a09f8460fb6e'), false, 'is_onboarded_org test - org does not exist');

-- Test is_canceled_org
SELECT
    is(is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_canceled_org test - org is not canceled');
SELECT
    is(is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6e'), false, 'is_canceled_org test - org does not exist');

SELECT * FROM finish();
ROLLBACK;
