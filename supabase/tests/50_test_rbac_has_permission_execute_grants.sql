BEGIN;

SELECT plan(2);

SELECT
    is(
        has_function_privilege(
            'authenticated',
            'public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint)',
            'EXECUTE'
        ),
        false,
        'authenticated does not have EXECUTE on public.rbac_has_permission'
    );

SELECT
    is(
        has_function_privilege(
            'service_role',
            'public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint)',
            'EXECUTE'
        ),
        true,
        'service_role retains EXECUTE on public.rbac_has_permission'
    );

SELECT finish();

ROLLBACK;
