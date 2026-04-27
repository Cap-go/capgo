BEGIN;

SELECT plan(2);

SELECT
    is(
        EXISTS (
            SELECT 1
            FROM pg_proc p
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
            LEFT JOIN pg_roles grantee_role
              ON grantee_role.oid = acl.grantee
            WHERE p.oid = 'public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint)'::regprocedure
              AND acl.privilege_type = 'EXECUTE'
              AND (
                  grantee_role.rolname = 'authenticated'
                  OR acl.grantee = 0
              )
        ),
        false,
        'authenticated does not have EXECUTE on public.rbac_has_permission'
    );

SELECT
    is(
        EXISTS (
            SELECT 1
            FROM pg_proc p
            CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
            JOIN pg_roles grantee_role
              ON grantee_role.oid = acl.grantee
            WHERE p.oid = 'public.rbac_has_permission(text, uuid, text, uuid, character varying, bigint)'::regprocedure
              AND grantee_role.rolname = 'service_role'
              AND acl.privilege_type = 'EXECUTE'
        ),
        true,
        'service_role retains EXECUTE on public.rbac_has_permission'
    );

SELECT finish();

ROLLBACK;
