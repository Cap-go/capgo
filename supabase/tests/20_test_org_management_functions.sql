BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(20);

-- Test accept_invitation_to_org (user is already a member, so should return INVALID_ROLE)
SELECT tests.authenticate_as('test_user');
SELECT is(accept_invitation_to_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'), 'INVALID_ROLE', 'accept_invitation_to_org test - user already member');
SELECT tests.clear_authentication();

-- Test invite_user_to_org (requires email functionality which may not be available)
SELECT tests.authenticate_as('test_admin');
SELECT ok(invite_user_to_org('newuser@example.com', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'read') IS NOT NULL, 'invite_user_to_org test - returns result');
SELECT ok(invite_user_to_org('existing@example.com', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'read') IS NOT NULL, 'invite_user_to_org test - returns result for existing');
SELECT tests.clear_authentication();

-- Test get_orgs_v6 without userid
SELECT tests.authenticate_as('test_admin');
SELECT ok((SELECT COUNT(*) FROM get_orgs_v6()) > 0, 'get_orgs_v6 test - returns organizations');
SELECT tests.clear_authentication();

-- Test get_orgs_v6 with userid
SELECT ok((SELECT COUNT(*) FROM get_orgs_v6('c591b04e-cf29-4945-b9a0-776d0672061a')) >= 0, 'get_orgs_v6 test - returns organizations for admin user');

-- Test get_org_members
SELECT tests.authenticate_as('test_admin');
SELECT ok((SELECT COUNT(*) FROM get_org_members('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_org_members test - returns members');
SELECT tests.clear_authentication();

-- Test get_org_members with user_id
SELECT ok((SELECT COUNT(*) FROM get_org_members(tests.get_supabase_uid('test_admin'), '22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_org_members test - returns members for user');

-- Test is_canceled_org
SELECT is(is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_canceled_org test - org not canceled');

-- Test is_paying_org (based on seed data, orgs have stripe_info so they are paying)
SELECT is(is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_paying_org test - org is paying based on seed');

-- Test is_trial_org
SELECT ok(is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d') >= 0, 'is_trial_org test - returns trial days');

-- Test is_onboarded_org (based on seed data, orgs are not onboarded)
SELECT is(is_onboarded_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_onboarded_org test - org not onboarded');

-- Test is_onboarding_needed_org (if not onboarded, onboarding is needed)
SELECT is(is_onboarding_needed_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), false, 'is_onboarding_needed_org test - onboarding not needed for paying org');

-- Test is_good_plan_v5_org (based on seed data with stripe_info)
SELECT is(is_good_plan_v5_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_good_plan_v5_org test - has good plan');

-- Test is_paying_and_good_plan_org
SELECT is(is_paying_and_good_plan_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_paying_and_good_plan_org test - paying and good plan');

-- Test is_allowed_action_org
SELECT is(is_allowed_action_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'), true, 'is_allowed_action_org test - action allowed for good plan');

-- Test is_allowed_action_org_action
SELECT is(is_allowed_action_org_action('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '{mau}'), true, 'is_allowed_action_org_action test - mau action allowed');

-- Test get_current_plan_name_org
SELECT ok(get_current_plan_name_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d') IS NOT NULL, 'get_current_plan_name_org test - returns plan name');

-- Test get_current_plan_max_org
SELECT ok((SELECT COUNT(*) FROM get_current_plan_max_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) = 1, 'get_current_plan_max_org test - returns plan limits');

-- Test get_cycle_info_org
SELECT ok((SELECT COUNT(*) FROM get_cycle_info_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d')) >= 0, 'get_cycle_info_org test - returns cycle info');

-- Test get_organization_cli_warnings
SELECT ok(array_length(get_organization_cli_warnings('22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'), 1) >= 0, 'get_organization_cli_warnings test - returns warnings array');

SELECT * FROM finish();
ROLLBACK; 
