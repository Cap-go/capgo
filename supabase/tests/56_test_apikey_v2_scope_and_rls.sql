BEGIN;

SELECT plan(18);

SELECT tests.authenticate_as_service_role();
SELECT tests.create_supabase_user('apikey_v2_scope_owner', 'apikey_v2_scope_owner@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES (
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey_v2_scope_owner@test.local',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
VALUES
  (
    '71000000-0000-4000-8000-000000000056',
    tests.get_supabase_uid('apikey_v2_scope_owner'),
    'API key V2 scope org A',
    'apikey-v2-scope-a@test.local',
    true
  ),
  (
    '72000000-0000-4000-8000-000000000056',
    tests.get_supabase_uid('apikey_v2_scope_owner'),
    'API key V2 scope org B',
    'apikey-v2-scope-b@test.local',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES
  (
    'com.test.apikeyv2scope.target',
    '',
    tests.get_supabase_uid('apikey_v2_scope_owner'),
    'API key V2 target app',
    '71000000-0000-4000-8000-000000000056'
  ),
  (
    'com.test.apikeyv2scope.sibling',
    '',
    tests.get_supabase_uid('apikey_v2_scope_owner'),
    'API key V2 sibling app',
    '71000000-0000-4000-8000-000000000056'
  ),
  (
    'com.test.apikeyv2scope.outside',
    '',
    tests.get_supabase_uid('apikey_v2_scope_owner'),
    'API key V2 outside app',
    '72000000-0000-4000-8000-000000000056'
  )
ON CONFLICT (app_id) DO NOTHING;

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  roles.id,
  public.rbac_scope_org(),
  orgs.id,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'pgTAP owner broad access to prove API key scope is independent',
  true
FROM public.roles
CROSS JOIN (
  VALUES
    ('71000000-0000-4000-8000-000000000056'::uuid),
    ('72000000-0000-4000-8000-000000000056'::uuid)
) AS orgs(id)
WHERE roles.name = public.rbac_role_org_super_admin()
ON CONFLICT DO NOTHING;

SELECT tests.create_v2_apikey(
  56001,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey-v2-scope-app-key',
  'apikey-v2-scope-app-key',
  '71000000-0000-4000-8000-000000000056'::uuid,
  public.rbac_role_org_member(),
  'com.test.apikeyv2scope.target',
  public.rbac_role_app_reader()
);

SELECT tests.create_v2_apikey(
  56002,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey-v2-scope-org-key',
  'apikey-v2-scope-org-key',
  '71000000-0000-4000-8000-000000000056'::uuid,
  public.rbac_role_org_super_admin()
);

SELECT tests.create_v2_apikey(
  56003,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey-v2-scope-both-key',
  'apikey-v2-scope-both-key',
  '71000000-0000-4000-8000-000000000056'::uuid,
  public.rbac_role_org_member(),
  'com.test.apikeyv2scope.target',
  public.rbac_role_app_reader()
);

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.target',
    NULL::bigint,
    'apikey-v2-scope-app-key'
  ),
  'app-limited legacy migration shape grants the selected app'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.sibling',
    NULL::bigint,
    'apikey-v2-scope-app-key'
  ),
  'app-limited legacy migration shape does not grant sibling apps'
);

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_org_read(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    NULL::varchar,
    NULL::bigint,
    'apikey-v2-scope-org-key'
  ),
  'org-limited legacy migration shape grants the selected org'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_read(),
    NULL::uuid,
    '72000000-0000-4000-8000-000000000056',
    NULL::varchar,
    NULL::bigint,
    'apikey-v2-scope-org-key'
  ),
  'org-limited legacy migration shape does not grant other orgs'
);

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.target',
    NULL::bigint,
    'apikey-v2-scope-both-key'
  ),
  'combined org/app limits grant an app inside the allowed org'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.sibling',
    NULL::bigint,
    'apikey-v2-scope-both-key'
  ),
  'combined org/app limits do not grant unlisted sibling apps'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '72000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.outside',
    NULL::bigint,
    'apikey-v2-scope-both-key'
  ),
  'combined org/app limits do not grant listed apps outside the allowed org'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-app-key"}', true);

WITH deleted_rows AS (
  DELETE FROM public.apikeys
  WHERE id = 56001
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM deleted_rows),
  0,
  'read app-scoped API key cannot delete owner API key rows through RLS'
);

WITH updated_rows AS (
  UPDATE public.users
  SET image_url = 'blocked-by-rls'
  WHERE id = tests.get_supabase_uid('apikey_v2_scope_owner')
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM updated_rows),
  0,
  'read app-scoped API key cannot update owner user rows through RLS'
);

SELECT is(
  (
    SELECT prorettype::regtype::text
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_identity(public.key_mode[])')
  ),
  'uuid',
  'legacy get_identity(key_mode[]) keeps uuid return shape'
);

SELECT is(
  (
    SELECT prorettype::regtype::text
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_identity_org_allowed(public.key_mode[],uuid)')
  ),
  'uuid',
  'legacy get_identity_org_allowed(key_mode[], uuid) keeps uuid return shape'
);

SELECT is(
  (
    SELECT prorettype::regtype::text
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_identity_org_appid(public.key_mode[],uuid,character varying)')
  ),
  'uuid',
  'legacy get_identity_org_appid(key_mode[], uuid, app_id) keeps uuid return shape'
);

SELECT is(
  (
    SELECT prorettype::regtype::text
    FROM pg_proc
    WHERE oid = to_regprocedure('public.cli_check_permission(text,text,uuid,text,bigint)')
  ),
  'boolean',
  'legacy cli_check_permission arguments keep boolean return shape'
);

SELECT is(
  (
    SELECT proretset
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_accessible_apps_for_apikey_v2(text)')
  ),
  true,
  'legacy get_accessible_apps_for_apikey_v2(text) still returns a set'
);

SELECT is(
  (
    SELECT prorettype
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_accessible_apps_for_apikey_v2(text)')
  ),
  'public.apps'::regtype::oid,
  'legacy get_accessible_apps_for_apikey_v2(text) keeps apps row return shape'
);

SELECT is(
  (
    SELECT prorettype::regtype::text
    FROM pg_proc
    WHERE oid = to_regprocedure('public.get_organization_cli_warnings(uuid,text)')
  ),
  'jsonb[]',
  'legacy get_organization_cli_warnings(uuid, text) keeps jsonb[] return shape'
);

SELECT ok(
  public.cli_check_permission(
    apikey := 'apikey-v2-scope-app-key',
    permission_key := public.rbac_perm_app_read(),
    org_id := '71000000-0000-4000-8000-000000000056'::uuid,
    app_id := 'com.test.apikeyv2scope.target',
    channel_id := NULL::bigint
  ),
  'old CLI permission RPC accepts the same arguments with RBAC-backed app scope'
);

SELECT is(
  pg_typeof(public.get_organization_cli_warnings('71000000-0000-4000-8000-000000000056'::uuid, '1.0.0'))::text,
  'jsonb[]',
  'old CLI warning RPC accepts the same arguments and returns jsonb[]'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{}', true);

SELECT * FROM finish();

ROLLBACK;
