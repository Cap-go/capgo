BEGIN;

SELECT plan(6);

DO $$
DECLARE
  org_id uuid := gen_random_uuid();
BEGIN
  PERFORM tests.create_supabase_user('test_rbac_admin_rpc_user', 'rbac_admin_rpc@test.com');

  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    tests.get_supabase_uid('test_rbac_admin_rpc_user'),
    'rbac_admin_rpc@test.com',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.orgs (id, created_by, name, management_email)
  VALUES (
    org_id,
    tests.get_supabase_uid('test_rbac_admin_rpc_user'),
    'RBAC Admin RPC Execute Grants Test Org',
    'rbac-admin-rpc@test.com'
  );

  INSERT INTO public.org_users (org_id, user_id, user_right)
  VALUES (
    org_id,
    tests.get_supabase_uid('test_rbac_admin_rpc_user'),
    'admin'::public.user_min_right
  );

  PERFORM set_config('test.rbac_admin_rpc_org', org_id::text, false);
END $$;

SELECT tests.authenticate_as('test_rbac_admin_rpc_user');

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.rbac_migrate_org_users_to_bindings(uuid, uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'rbac_migrate_org_users_to_bindings blocks authenticated callers'
    );

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.rbac_enable_for_org(uuid, uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'rbac_enable_for_org blocks authenticated callers'
    );

SELECT
    is(
        has_function_privilege(
            'authenticated'::name,
            'public.rbac_rollback_org(uuid)'::regprocedure,
            'EXECUTE'
        ),
        false,
        'rbac_rollback_org blocks authenticated callers'
    );

SELECT tests.authenticate_as_service_role();

SELECT
    ok(
        public.rbac_enable_for_org(
            current_setting('test.rbac_admin_rpc_org')::uuid,
            tests.get_supabase_uid('test_rbac_admin_rpc_user')
        ) ->> 'status' IN ('success', 'already_enabled'),
        'rbac_enable_for_org still works for service_role'
    );

SELECT
    is(
        public.rbac_migrate_org_users_to_bindings(
            current_setting('test.rbac_admin_rpc_org')::uuid,
            tests.get_supabase_uid('test_rbac_admin_rpc_user')
        ) ->> 'org_id',
        current_setting('test.rbac_admin_rpc_org'),
        'rbac_migrate_org_users_to_bindings still works for service_role'
    );

SELECT
    is(
        public.rbac_rollback_org(
            current_setting('test.rbac_admin_rpc_org')::uuid
        ) ->> 'status',
        'success',
        'rbac_rollback_org still works for service_role'
    );

SELECT finish();

ROLLBACK;
