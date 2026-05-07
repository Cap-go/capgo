BEGIN;

SELECT plan(26);

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

-- Published CLI v7.x still reads `public.apps` through anon PostgREST RLS.
-- That path calls `get_identity_org_appid()` directly from the apps SELECT
-- policy, which depends on `get_apikey_header()` and `is_apikey_expired()`,
-- then calls `check_min_rights()`, which re-checks API-key RBAC scope on RBAC
-- orgs. Keep those anon grants covered until the CLI switches to the
-- RBAC-aware wrappers.
SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_apikey_header()'::regprocedure,
            'EXECUTE'
        ),
        true,
        'anon role keeps execute privilege on get_apikey_header()'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.is_apikey_expired(timestamp with time zone)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'anon role keeps execute privilege on'
        || ' is_apikey_expired(timestamp with time zone)'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.get_identity_org_appid(public.key_mode[], uuid, character varying)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'anon role keeps execute privilege on'
        || ' get_identity_org_appid(public.key_mode[], uuid, character varying)'
    );

SELECT
    is(
        has_function_privilege(
            'anon'::name,
            'public.check_min_rights(public.user_min_right, uuid, uuid, character varying, bigint)'::regprocedure,
            'EXECUTE'
        ),
        true,
        'anon role keeps execute privilege on'
        || ' check_min_rights(public.user_min_right, uuid, uuid, character varying, bigint)'
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

INSERT INTO storage.objects (bucket_id, name)
VALUES (
    'apps',
    '6aa76066-55ef-4238-ade6-0b32334a4097/com.demo.app/rpc-permission-test.txt'
)
ON CONFLICT (bucket_id, name) DO NOTHING;

SET LOCAL ROLE anon;

DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

SELECT
    is(
        (
            SELECT count(*)
            FROM storage.objects
            WHERE
                bucket_id = 'apps'
                AND name
                = '6aa76066-55ef-4238-ade6-0b32334a4097/'
                || 'com.demo.app/rpc-permission-test.txt'
        ),
        0::bigint,
        'anon without capgkey cannot read app-scoped storage objects'
    );

SELECT
    is(
        public.cli_check_permission(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            public.rbac_perm_app_read(),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            'com.demo.app',
            NULL::bigint
        ),
        false,
        'anon cannot use cli_check_permission with only an apikey argument'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM public.get_accessible_apps_for_apikey_v2(
                'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
            )
        ),
        0::bigint,
        'anon cannot enumerate apps with only an apikey argument'
    );

DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);
END $$;

SELECT
    is(
        (
            SELECT count(*)
            FROM storage.objects
            WHERE
                bucket_id = 'apps'
                AND name
                = '6aa76066-55ef-4238-ade6-0b32334a4097/'
                || 'com.demo.app/rpc-permission-test.txt'
        ),
        1::bigint,
        'anon API-key storage access still works through header-based identity'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM public.apps
            WHERE app_id = 'com.demo.app'
        ),
        1::bigint,
        'anon API-key apps query still works through RLS helper identity'
    );

SELECT
    is(
        public.cli_check_permission(
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            public.rbac_perm_app_read(),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            'com.demo.app',
            NULL::bigint
        ),
        true,
        'anon can use cli_check_permission when apikey matches capgkey header'
    );

SELECT
    ok(
        (
            SELECT count(*) > 0
            FROM public.get_accessible_apps_for_apikey_v2(
                'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
            )
        ),
        'anon can list accessible apps when apikey matches capgkey header'
    );

SELECT
    is(
        public.cli_check_permission(
            'different-key',
            public.rbac_perm_app_read(),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            'com.demo.app',
            NULL::bigint
        ),
        false,
        'anon cannot use cli_check_permission when apikey argument differs from capgkey header'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM public.get_accessible_apps_for_apikey_v2('different-key')
        ),
        0::bigint,
        'anon cannot list accessible apps when apikey argument differs from capgkey header'
    );

DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "invalid-key"}', true);
END $$;

SELECT
    is(
        (
            SELECT count(*)
            FROM public.apps
            WHERE app_id = 'com.demo.app'
        ),
        0::bigint,
        'anon with invalid capgkey cannot read apps through helper identity'
    );

SELECT
    is(
        (
            SELECT count(*)
            FROM storage.objects
            WHERE
                bucket_id = 'apps'
                AND name
                = '6aa76066-55ef-4238-ade6-0b32334a4097/'
                || 'com.demo.app/rpc-permission-test.txt'
        ),
        0::bigint,
        'anon with invalid capgkey still cannot read app-scoped storage objects'
    );

RESET ROLE;

DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

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
