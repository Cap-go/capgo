BEGIN;

SELECT plan(8);

-- Member of admin org can read billing/trial RPCs
SELECT tests.authenticate_as('test_admin');

SELECT
    is(
        is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        true,
        'is_paying_org - org admin can read paying state'
    );

SELECT
    is(
        public.is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        (
            SELECT COALESCE(
                GREATEST((trial_at::date - CURRENT_DATE), 0),
                0
            )::integer
            FROM public.stripe_info
            WHERE customer_id = 'cus_Pa0k8TO6HVln6A'
        ),
        'is_trial_org - org admin can read trial days'
    );

-- Non-member should be denied by org authorization checks
SELECT tests.authenticate_as('test_user');

SELECT
    is(
        is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        false,
        'is_paying_org - non-member org user gets false'
    );

SELECT
    is(
        is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        0,
        'is_trial_org - non-member org user gets 0'
    );

-- Anonymous user should not have execute permission
SELECT tests.clear_authentication();

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.is_paying_org(uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'is_paying_org - anonymous execute is blocked'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.is_trial_org(uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'is_trial_org - anonymous execute is blocked'
    );

-- service role keeps backend-style access
SELECT tests.authenticate_as_service_role();

SELECT
    is(
        is_paying_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        true,
        'is_paying_org - service role can read paying state'
    );

SELECT
    is(
        public.is_trial_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        (
            SELECT COALESCE(
                GREATEST((trial_at::date - CURRENT_DATE), 0),
                0
            )::integer
            FROM public.stripe_info
            WHERE customer_id = 'cus_Pa0k8TO6HVln6A'
        ),
        'is_trial_org - service role can read trial days'
    );

SELECT
    *
FROM
    finish();

ROLLBACK;
