BEGIN;

SELECT plan(18);

SELECT tests.authenticate_as('test_admin');

SELECT
    is(
        is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        false,
        'is_canceled_org - authorized org admin can read state'
    );

SELECT
    is(
        is_good_plan_v5_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        true,
        'is_good_plan_v5_org - authorized org admin can read plan fit'
    );

SELECT
    is(
        is_paying_and_good_plan_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        true,
        'is_paying_and_good_plan_org - authorized org admin can read billing status'
    );

SELECT
    ok(
        get_total_storage_size_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d') > 0,
        'get_total_storage_size_org - authorized org admin can read storage'
    );

SELECT
    ok(
        get_total_app_storage_size_orgs('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'com.demoadmin.app') > 0,
        'get_total_app_storage_size_orgs - authorized org admin can read app storage'
    );

SELECT
    is(
        get_user_main_org_id(tests.get_supabase_uid('test_admin')),
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d'::uuid,
        'get_user_main_org_id - authenticated user can resolve own main org'
    );

SELECT
    is(
        is_member_of_org(
            tests.get_supabase_uid('test_admin'),
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ),
        true,
        'is_member_of_org - authenticated user can check own membership'
    );

SELECT tests.authenticate_as_service_role();

INSERT INTO public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES (
    tests.get_supabase_uid('test_admin'),
    now() + interval '1 day',
    '{}'::jsonb
);

SELECT tests.authenticate_as('test_admin');

SELECT
    is(
        is_account_disabled(tests.get_supabase_uid('test_admin')),
        true,
        'is_account_disabled - authenticated user can read own disabled status'
    );

SELECT
    ok(
        get_account_removal_date() > now(),
        'get_account_removal_date - authenticated disabled user can read own removal date'
    );

SELECT restore_deleted_account();

SELECT
    is(
        is_account_disabled(tests.get_supabase_uid('test_admin')),
        false,
        'restore_deleted_account - authenticated user can restore own pending deletion'
    );

SELECT tests.authenticate_as('test_user');

SELECT
    is(
        is_canceled_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        false,
        'is_canceled_org - foreign org user gets false'
    );

SELECT
    is(
        get_total_storage_size_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        0::double precision,
        'get_total_storage_size_org - foreign org user gets zero'
    );

SELECT
    is(
        is_member_of_org(
            tests.get_supabase_uid('test_admin'),
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ),
        false,
        'is_member_of_org - cross-user membership query is denied'
    );

SELECT tests.clear_authentication();

SELECT
    is(
        is_paying_and_good_plan_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        false,
        'is_paying_and_good_plan_org - anonymous call is non-disclosing'
    );

SELECT
    is(
        get_total_app_storage_size_orgs('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'com.demoadmin.app'),
        0::double precision,
        'get_total_app_storage_size_orgs - anonymous call is non-disclosing'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_user_main_org_id(uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'get_user_main_org_id - anonymous execute is blocked'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.is_account_disabled(uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'is_account_disabled - anonymous execute is blocked'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.restore_deleted_account()'::regprocedure,
            'EXECUTE'
        ),
        false,
        'restore_deleted_account - anonymous execute is blocked'
    );

SELECT * FROM finish();

ROLLBACK;
