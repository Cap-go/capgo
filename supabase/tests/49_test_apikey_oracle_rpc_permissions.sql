BEGIN;

SELECT plan(11);

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_user_id(text)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'anon role has no execute privilege on get_user_id(text)'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_user_id(text, text)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'anon role has no execute privilege on get_user_id(text, text)'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_org_perm_for_apikey(text, text)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'anon role has no execute privilege on'
        || ' get_org_perm_for_apikey(text, text)'
    );

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.get_user_id(text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'authenticated role keeps execute privilege on get_user_id(text)'
    );

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.get_user_id(text, text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'authenticated role keeps execute privilege on get_user_id(text, text)'
    );

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.get_org_perm_for_apikey(text, text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'authenticated role keeps execute privilege on'
        || ' get_org_perm_for_apikey(text, text)'
    );

SELECT
    is(
        has_function_privilege(
            'service_role'::name,
            'public.get_user_id(text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'service_role keeps execute privilege on get_user_id(text)'
    );

SELECT
    is(
        has_function_privilege(
            'service_role'::name,
            'public.get_user_id(text, text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'service_role keeps execute privilege on get_user_id(text, text)'
    );

SELECT
    is(
        has_function_privilege(
            'service_role'::name,
            'public.get_org_perm_for_apikey(text, text)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'service_role keeps execute privilege on'
        || ' get_org_perm_for_apikey(text, text)'
    );

SET LOCAL ROLE authenticated;

SELECT
    results_eq(
        'SELECT get_user_id(''ae6e7458-c46d-4c00-aa3b-153b0b8520ea'')',
        $$VALUES ('6aa76066-55ef-4238-ade6-0b32334a4097'::uuid)$$,
        'authenticated execution of get_user_id(text) still works'
    );

SELECT
    is(
        get_org_perm_for_apikey(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        'perm_owner',
        'authenticated execution of'
        || ' get_org_perm_for_apikey(text, text) still works'
    );

RESET ROLE;

SELECT finish();

ROLLBACK;
