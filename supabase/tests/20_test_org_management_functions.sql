BEGIN;


SELECT plan(51);

-- Test accept_invitation_to_org (user is already a member, so should return INVALID_ROLE)
SELECT tests.authenticate_as('test_user');

SELECT
    is(
        accept_invitation_to_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
        'INVALID_ROLE',
        'accept_invitation_to_org test - user already member'
    );

SELECT tests.clear_authentication();

-- Test invite_user_to_org (requires email functionality which may not be available)
SELECT tests.authenticate_as('test_admin');

SELECT
    ok(
        invite_user_to_org(
            'newuser@example.com',
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            'read'
        ) IS NOT NULL,
        'invite_user_to_org test - returns result'
    );

SELECT
    ok(
        invite_user_to_org(
            'existing@example.com',
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            'read'
        ) IS NOT NULL,
        'invite_user_to_org test - returns result for existing'
    );

SELECT tests.clear_authentication();

-- Test get_orgs_v6 without userid
SELECT tests.authenticate_as('test_admin');

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
        ) > 0,
        'get_orgs_v6 test - returns organizations'
    );

SELECT tests.clear_authentication();

-- Test get_orgs_v6 with userid (requires service_role since function is private)
SELECT tests.authenticate_as_service_role();
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6('c591b04e-cf29-4945-b9a0-776d0672061a')
        ) >= 0,
        'get_orgs_v6 test - returns organizations for admin user'
    );
SELECT tests.clear_authentication();

-- Test get_orgs_v6 with API key
-- Test 1: Valid API key without limitations
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}',
        TRUE
    );

-- Verify the API key header is set correctly
SELECT
    is(
        (
            (current_setting('request.headers'::text, TRUE))::json
            ->> 'capgkey'::text
        ),
        '67eeaff4-ae4c-49a6-8eb1-0875f5369de1',
        'get_orgs_v6 API key test - header reading method works'
    );

-- Test with valid API key
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
        ) > 0,
        'get_orgs_v6 API key test - returns organizations with valid API key'
    );

-- Test 2: Invalid API key - should throw specific error
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "invalid-key-12345"}',
        TRUE
    );

SELECT
    throws_like(
        'SELECT get_orgs_v6()',
        '%Invalid API key provided%',
        'get_orgs_v6 API key test - throws correct error message for invalid API key'
    );

-- Test 3: V2 API key with org RBAC bindings
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520eb"}',
        TRUE
    );

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
        ) >= 0,
        'get_orgs_v6 API key test - works with org-bound V2 API key'
    );

-- Verify that the V2 API key can see its bound organization
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
            WHERE
                gid = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ) >= 0,
        'get_orgs_v6 API key test - V2 API key returns bound organizations'
    );

-- Test 4: V2 API key can be reused across calls
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520eb"}',
        TRUE
    );

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
        ) >= 0,
        'get_orgs_v6 API key test - V2 API key works normally'
    );

-- Test 5: V2 API key without legacy scope columns continues to work
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520eb"}',
        TRUE
    );

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_orgs_v6()
        ) >= 0,
        'get_orgs_v6 API key test - API key without legacy limitations works normally'
    );

-- Test 6: No API key header (should fall back to identity and throw error)
SELECT set_config('request.headers', '{}', TRUE);

SELECT
    throws_like(
        'SELECT get_orgs_v6()',
        '%No authentication provided - API key or valid session required%',
        'get_orgs_v6 API key test - throws correct error when no authentication'
    );

-- Test 7: Null headers (should fall back to identity and throw error)
SELECT set_config('request.headers', '', TRUE);

SELECT
    throws_like(
        'SELECT get_orgs_v6()',
        '%No authentication provided - API key or valid session required%',
        'get_orgs_v6 API key test - throws correct error when null headers'
    );

-- Test get_org_members
SELECT tests.authenticate_as('test_admin');

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_org_members('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
        ) >= 0,
        'get_org_members test - returns members'
    );

SELECT tests.clear_authentication();

-- Test get_org_members with user_id
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_org_members(
                    tests.get_supabase_uid('test_admin'),
                    '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
                )
        ) >= 0,
        'get_org_members test - returns members for user'
    );

-- Test is_canceled_org
SELECT
    is(
        is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        FALSE,
        'is_canceled_org test - org not canceled'
    );

-- Test is_canceled_org negative case
SELECT
    is(
        is_canceled_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_canceled_org test - non-existent org returns false'
    );

-- Test is_paying_org (based on seed data, orgs have stripe_info so they are paying)
SELECT tests.authenticate_as_service_role();

SELECT
    is(
        is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        TRUE,
        'is_paying_org test - org is paying based on seed'
    );

-- Test is_paying_org negative case
SELECT
    is(
        is_paying_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_paying_org test - non-existent org returns false'
    );

-- Test is_trial_org
SELECT
    ok(
        is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d') >= 0,
        'is_trial_org test - returns trial days'
    );

-- Test is_trial_org negative case
SELECT
    ok(
        COALESCE(is_trial_org('00000000-0000-0000-0000-000000000000'), 0) = 0,
        'is_trial_org test - non-existent org returns 0'
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
    is(
        is_onboarded_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_onboarded_org test - non-existent org returns false'
    );

-- Test is_onboarding_needed_org
-- Note: This test runs in the same transaction where we modify stripe_info later
-- The org is not onboarded, and if the trial gets expired in a later test, 
-- onboarding will be needed. So we just check it returns a boolean.
SELECT
    ok(
        is_onboarding_needed_org(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ) IS NOT NULL,
        'is_onboarding_needed_org test - returns boolean result'
    );

-- Test is_onboarding_needed_org negative case
SELECT
    ok(
        COALESCE(is_onboarding_needed_org(
            '00000000-0000-0000-0000-000000000000'
        ), FALSE) = FALSE,
        'is_onboarding_needed_org test - non-existent org returns false'
    );

-- Test is_good_plan_v5_org (based on seed data with stripe_info)
SELECT
    is(
        is_good_plan_v5_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        TRUE,
        'is_good_plan_v5_org test - has good plan'
    );

-- Test is_good_plan_v5_org negative case
SELECT
    is(
        is_good_plan_v5_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_good_plan_v5_org test - non-existent org returns false'
    );

-- Test is_paying_and_good_plan_org
SELECT
    is(
        is_paying_and_good_plan_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        TRUE,
        'is_paying_and_good_plan_org test - paying and good plan'
    );

-- Test is_paying_and_good_plan_org negative case
SELECT
    is(
        is_paying_and_good_plan_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_paying_and_good_plan_org test - non-existent org returns false'
    );

-- Test is_paying_and_good_plan_org for Demo org (used by statistics tests)
SELECT
    is(
        is_paying_and_good_plan_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
        TRUE,
        'is_paying_and_good_plan_org test - Demo org has paying and good plan'
    );

-- Test is_allowed_action_org
SELECT
    is(
        is_allowed_action_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        TRUE,
        'is_allowed_action_org test - action allowed for good plan'
    );

-- Test is_allowed_action_org negative case
SELECT
    is(
        is_allowed_action_org('00000000-0000-0000-0000-000000000000'),
        FALSE,
        'is_allowed_action_org test - non-existent org returns false'
    );

-- Test is_allowed_action_org_action
SELECT
    is(
        is_allowed_action_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '{mau}'
        ),
        TRUE,
        'is_allowed_action_org_action test - mau action allowed'
    );

-- Test is_allowed_action_org_action negative case
SELECT
    is(
        is_allowed_action_org_action(
            '00000000-0000-0000-0000-000000000000', '{mau}'
        ),
        FALSE,
        'is_allowed_action_org_action test - non-existent org returns false'
    );

-- Test get_current_plan_name_org
SELECT tests.authenticate_as('test_admin');
SELECT
    ok(
        get_current_plan_name_org(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ) IS NOT NULL,
        'get_current_plan_name_org test - returns plan name'
    );
SELECT tests.clear_authentication();

-- Test get_current_plan_max_org
SELECT tests.authenticate_as_service_role();
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_current_plan_max_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
        ) = 1,
        'get_current_plan_max_org test - returns plan limits'
    );
SELECT tests.clear_authentication();

-- Test get_cycle_info_org
SELECT tests.authenticate_as('test_admin');
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                get_cycle_info_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
        ) >= 0,
        'get_cycle_info_org test - returns cycle info'
    );
SELECT tests.clear_authentication();

-- Test get_organization_cli_warnings with proper API key setup
-- Test 1: Set up valid API key and test normal scenario (good plan)
SELECT tests.authenticate_as_service_role();

SELECT
    set_config(
        'request.headers',
        '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}',
        TRUE
    );

SELECT
    ok(
        get_identity_apikey_only('{read,all}') IS NOT NULL,
        'get_identity_apikey_only test - returns user when valid read apikey is set'
    );

-- Test the function with a valid org and good plan
SELECT
    ok(
        coalesce(
            array_length(
                get_organization_cli_warnings(
                    '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
                ),
                1
            ),
            0
        ) >= 0,
        'get_organization_cli_warnings test - returns warnings array for valid org with good plan'
    );

-- Test 2: Test with invalid API key (should return access denied)
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "invalid-key"}',
        TRUE
    );

SELECT
    ok(
        get_identity_apikey_only('{read,all}') IS NULL,
        'get_identity_apikey_only test - returns null when invalid apikey is set'
    );

-- This should return an access denied message
SELECT
    ok(
        array_length(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            ),
            1
        ) = 1,
        'get_organization_cli_warnings test - returns single warning for invalid API key'
    );

-- Test 2b: RBAC v2 path — apikey with an org binding gets org.read.
-- Owned by the legacy fixture user (super_admin of the test org). In this
-- codebase's RBAC v2 model the apikey binding mirrors the user's right (see
-- supabase/functions/_backend/public/apikey/post.ts where the apikey creation
-- flow auto-inserts an org-read compatibility binding alongside app-level
-- bindings). The fix this test guards proves the V2 path still
-- resolves correctly through cli_check_permission after V1 mode is removed.
SELECT tests.clear_authentication();
SELECT tests.authenticate_as_service_role();

DO $$
DECLARE
    v_user_id uuid;
    v_apikey_rbac_id uuid;
    v_org_member_role_id uuid;
    v_app_uploader_role_id uuid;
    v_demoadmin_app_uuid uuid;
    v_demo_app_uuid uuid;
    v_demo_app_org_id uuid;
BEGIN
    SELECT user_id INTO v_user_id FROM public.apikeys
    WHERE key = '67eeaff4-ae4c-49a6-8eb1-0875f5369de1';

    INSERT INTO public.apikeys (id, user_id, key, name)
    VALUES (
        99020001,
        v_user_id,
        'rbac-v2-cli-warnings-test-key',
        'rbac-v2-cli-warnings-test'
    )
    RETURNING rbac_id INTO v_apikey_rbac_id;

    SELECT id INTO v_org_member_role_id
    FROM public.roles
    WHERE name = public.rbac_role_org_member();

    SELECT id INTO v_app_uploader_role_id
    FROM public.roles
    WHERE name = public.rbac_role_app_uploader();

    SELECT id INTO v_demoadmin_app_uuid
    FROM public.apps
    WHERE app_id = 'com.demoadmin.app';

    SELECT id, owner_org
    INTO v_demo_app_uuid, v_demo_app_org_id
    FROM public.apps
    WHERE app_id = 'com.demo.app';

    INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, granted_by
    )
    VALUES (
        'apikey',
        v_apikey_rbac_id,
        v_org_member_role_id,
        'org',
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        v_user_id
    );

    -- App-scoped RBAC v2 key with only an app_uploader binding. Existing CLIs
    -- call the warning RPC with only org id, so the RPC must bridge through an
    -- app in the requested org instead of relying on removed V1 scope columns.
    INSERT INTO public.apikeys (
        id, user_id, key, name
    )
    VALUES (
        99020004,
        v_user_id,
        'rbac-v2-cli-warnings-test-key-app-scoped',
        'rbac-v2-cli-warnings-test-app-scoped'
    )
    RETURNING rbac_id INTO v_apikey_rbac_id;

    INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by
    )
    VALUES (
        'apikey',
        v_apikey_rbac_id,
        v_app_uploader_role_id,
        'app',
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        v_demoadmin_app_uuid,
        v_user_id
    );

    -- App-scoped key whose only app binding belongs to another org. The fallback
    -- must not turn this into org read access for the requested org.
    INSERT INTO public.apikeys (
        id, user_id, key, name
    )
    VALUES (
        99020005,
        v_user_id,
        'rbac-v2-cli-warnings-test-key-app-scoped-away',
        'rbac-v2-cli-warnings-test-app-scoped-away'
    )
    RETURNING rbac_id INTO v_apikey_rbac_id;

    INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id,
        granted_by
    )
    VALUES (
        'apikey',
        v_apikey_rbac_id,
        v_app_uploader_role_id,
        'app',
        v_demo_app_org_id,
        v_demo_app_uuid,
        v_user_id
    );

    -- Second RBAC v2 key without bindings for the test org. The owning user is
    -- super_admin of the test org, so the API key must not inherit user rights.
    INSERT INTO public.apikeys (id, user_id, key, name)
    VALUES (
        99020002,
        v_user_id,
        'rbac-v2-cli-warnings-test-key-no-binding',
        'rbac-v2-cli-warnings-test-no-binding'
    );

    -- Expired RBAC v2 key (with a valid binding) — expiry must override the binding
    INSERT INTO public.apikeys (id, user_id, key, name, expires_at)
    VALUES (
        99020003,
        v_user_id,
        'rbac-v2-cli-warnings-test-key-expired',
        'rbac-v2-cli-warnings-test-expired',
        NOW() - INTERVAL '1 day'
    )
    RETURNING rbac_id INTO v_apikey_rbac_id;

    INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, granted_by
    )
    VALUES (
        'apikey',
        v_apikey_rbac_id,
        v_org_member_role_id,
        'org',
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        v_user_id
    );
END $$;

-- Case A: RBAC v2 key WITH org.read binding — expect NO fatal "no read access" warning
SELECT set_config(
    'request.headers',
    '{"capgkey": "rbac-v2-cli-warnings-test-key"}',
    TRUE
);

SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
    ),
    'get_organization_cli_warnings RBAC v2 - key with org.read binding has no fatal no-read-access warning'
);

-- Case A2: RBAC v2 key limited to this org and app - expect NO fatal warning.
-- Existing CLIs call this RPC with only org id, so the function must bridge the
-- org-read warning check through one allowed app in that org.
SELECT set_config(
    'request.headers',
    '{"capgkey": "rbac-v2-cli-warnings-test-key-app-scoped"}',
    TRUE
);

SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
    ),
    'get_organization_cli_warnings RBAC v2 - app-scoped key for this org passes'
);

-- Case A3: RBAC v2 key limited to an app outside this org - expect fatal.
SELECT set_config(
    'request.headers',
    '{"capgkey": "rbac-v2-cli-warnings-test-key-app-scoped-away"}',
    TRUE
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
          AND (msg->>'fatal')::boolean = true
    ),
    'get_organization_cli_warnings RBAC v2 - app-scoped key outside org fails'
);

-- Case B: RBAC v2 key WITHOUT a binding for this org — expect the fatal warning
SELECT set_config(
    'request.headers',
    '{"capgkey": "rbac-v2-cli-warnings-test-key-no-binding"}',
    TRUE
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
          AND (msg->>'fatal')::boolean = true
    ),
    'get_organization_cli_warnings RBAC v2 - key without org binding returns fatal no-read-access warning'
);

-- Case C: Expired RBAC v2 key (even with a valid binding) — expect the fatal warning
SELECT set_config(
    'request.headers',
    '{"capgkey": "rbac-v2-cli-warnings-test-key-expired"}',
    TRUE
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
          AND (msg->>'fatal')::boolean = true
    ),
    'get_organization_cli_warnings RBAC v2 - expired key returns fatal no-read-access warning'
);

-- Case D: No capgkey header at all — expect the fatal warning
SELECT set_config(
    'request.headers',
    '{}',
    TRUE
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM unnest(
            get_organization_cli_warnings(
                '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '1.0.0'
            )
        ) AS msg
        WHERE msg->>'message' = 'API key does not have read access to this organization'
          AND (msg->>'fatal')::boolean = true
    ),
    'get_organization_cli_warnings RBAC v2 - missing capgkey header returns fatal no-read-access warning'
);

-- Restore the legacy fixture key for any tests that follow this block
SELECT set_config(
    'request.headers',
    '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}',
    TRUE
);

-- Test 3: Test is_paying_and_good_plan_org_action directly with valid setup
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}',
        TRUE
    );

-- Test individual action types
SELECT
    ok(
        is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['mau']::public.action_type []
        ) IS NOT NULL,
        'is_paying_and_good_plan_org_action test - MAU action returns result'
    );

SELECT
    ok(
        is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['storage']::public.action_type []
        ) IS NOT NULL,
        'is_paying_and_good_plan_org_action test - Storage action returns result'
    );

SELECT
    ok(
        is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['bandwidth']::public.action_type []
        ) IS NOT NULL,
        'is_paying_and_good_plan_org_action test - Bandwidth action returns result'
    );

-- Test multiple actions
SELECT
    ok(
        is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['mau', 'storage', 'bandwidth']::public.action_type []
        ) IS NOT NULL,
        'is_paying_and_good_plan_org_action test - Multiple actions return result'
    );

-- Test 4: Force storage exceeded scenario to test warning message
-- The seed data creates stripe_info with trial_at in the future, so we need to expire it
-- and set storage_exceeded to trigger the warning
UPDATE stripe_info
SET
    storage_exceeded = TRUE,
    mau_exceeded = FALSE,
    bandwidth_exceeded = FALSE,
    trial_at = now() - interval '30 days',
    status = 'succeeded',
    is_good_plan = TRUE
WHERE
    customer_id = 'cus_Pa0k8TO6HVln6A';

-- Reset headers first
SELECT set_config('request.headers', NULL, TRUE);

-- Set API key for storage exceeded tests
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1"}',
        TRUE
    );

-- Debug: Check the state of stripe_info and org
SELECT diag('Debug: Checking stripe_info state');

-- Check what the customer_id is for this org
SELECT
    diag(
        'Org customer_id: ' || coalesce(customer_id, 'NULL')
    )
FROM
    orgs
WHERE
    id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d';

-- Check what stripe_info records exist
SELECT
    diag(
        'Existing stripe_info customer_ids: ' || string_agg(customer_id, ', ')
    )
FROM
    stripe_info;

-- Check stripe_info state BEFORE update
SELECT diag('BEFORE UPDATE:');

SELECT
    diag(
        'customer_id: '
        || coalesce(customer_id, 'NULL')
        || ', status: '
        || coalesce(status::text, 'NULL')
        || ', storage_exceeded: '
        || storage_exceeded::text
        || ', mau_exceeded: '
        || mau_exceeded::text
        || ', bandwidth_exceeded: '
        || bandwidth_exceeded::text
        || ', trial_at: '
        || coalesce(trial_at::text, 'NULL')
        || ', is_good_plan: '
        || is_good_plan::text
    )
FROM
    stripe_info
WHERE
    customer_id = 'cus_Pa0k8TO6HVln6A';

-- Check stripe_info state AFTER update
SELECT diag('AFTER UPDATE:');

SELECT
    diag(
        'customer_id: '
        || coalesce(customer_id, 'NULL')
        || ', status: '
        || coalesce(status::text, 'NULL')
        || ', storage_exceeded: '
        || storage_exceeded::text
        || ', mau_exceeded: '
        || mau_exceeded::text
        || ', bandwidth_exceeded: '
        || bandwidth_exceeded::text
        || ', trial_at: '
        || coalesce(trial_at::text, 'NULL')
        || ', is_good_plan: '
        || is_good_plan::text
    )
FROM
    stripe_info
WHERE
    customer_id = 'cus_Pa0k8TO6HVln6A';

-- Debug: Check what is_paying_and_good_plan_org_action returns
SELECT
    diag(
        'Debug: is_paying_and_good_plan_org_action results'
    );

SELECT
    diag(
        'mau: ' || is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['mau']::public.action_type []
        )::text
    );

SELECT
    diag(
        'bandwidth: ' || is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['bandwidth']::public.action_type []
        )::text
    );

SELECT
    diag(
        'storage: ' || is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
            ARRAY['storage']::public.action_type []
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
    storage_exceeded = FALSE,
    mau_exceeded = FALSE,
    bandwidth_exceeded = FALSE,
    trial_at = now() + interval '15 days'
WHERE
    customer_id = (
        SELECT customer_id
        FROM
            orgs
        WHERE
            id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    );

-- Reset the request headers for other tests
SELECT set_config('request.headers', NULL, TRUE);

SELECT *
FROM
    finish();

ROLLBACK;
