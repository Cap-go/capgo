BEGIN;

SELECT plan(3);

SELECT tests.create_supabase_user('get_org_apikeys_admin', 'get_org_apikeys_admin@test.local');
SELECT tests.create_supabase_user('get_org_apikeys_member', 'get_org_apikeys_member@test.local');
SELECT tests.create_supabase_user('get_org_apikeys_owner', 'get_org_apikeys_owner@test.local');
SELECT tests.create_supabase_user('get_org_apikeys_apikey_only_owner', 'get_org_apikeys_apikey_only_owner@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
  (tests.get_supabase_uid('get_org_apikeys_admin'), 'get_org_apikeys_admin@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('get_org_apikeys_member'), 'get_org_apikeys_member@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('get_org_apikeys_owner'), 'get_org_apikeys_owner@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('get_org_apikeys_apikey_only_owner'), 'get_org_apikeys_apikey_only_owner@test.local', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
VALUES (
  '70000000-0000-4000-8000-000000000047',
  tests.get_supabase_uid('get_org_apikeys_admin'),
  'Get org apikeys permission org',
  'get-org-apikeys@test.local',
  true
)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.role_bindings
WHERE principal_type = public.rbac_principal_user()
  AND principal_id IN (
    tests.get_supabase_uid('get_org_apikeys_admin'),
    tests.get_supabase_uid('get_org_apikeys_member')
  )
  AND scope_type = public.rbac_scope_org()
  AND org_id = '70000000-0000-4000-8000-000000000047';

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('get_org_apikeys_admin'),
  r.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000047',
  tests.get_supabase_uid('get_org_apikeys_admin')
FROM public.roles r
WHERE r.name = public.rbac_role_org_admin();

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('get_org_apikeys_member'),
  r.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000047',
  tests.get_supabase_uid('get_org_apikeys_admin')
FROM public.roles r
WHERE r.name = public.rbac_role_org_member();

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs)
VALUES (
  45047,
  tests.get_supabase_uid('get_org_apikeys_owner'),
  'get-org-apikeys-key',
  'all'::public.key_mode,
  'get-org-apikeys-key',
  ARRAY['70000000-0000-4000-8000-000000000047'::uuid]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs)
VALUES (
  45048,
  tests.get_supabase_uid('get_org_apikeys_apikey_only_owner'),
  'get-org-apikeys-apikey-bound-key',
  'all'::public.key_mode,
  'get-org-apikeys-apikey-bound-key',
  ARRAY['70000000-0000-4000-8000-000000000047'::uuid]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('get_org_apikeys_owner'),
  r.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000047',
  tests.get_supabase_uid('get_org_apikeys_admin')
FROM public.roles r
WHERE r.name = public.rbac_role_org_member()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT
  public.rbac_principal_apikey(),
  ak.rbac_id,
  r.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000047',
  tests.get_supabase_uid('get_org_apikeys_admin')
FROM public.roles r
JOIN public.apikeys ak
  ON ak.id = 45048
WHERE r.name = public.rbac_role_org_member()
ON CONFLICT DO NOTHING;

SELECT tests.authenticate_as('get_org_apikeys_member');

SELECT throws_ok(
  $q$
    SELECT *
    FROM public.get_org_apikeys('70000000-0000-4000-8000-000000000047'::uuid);
  $q$,
  'NO_RIGHTS',
  'get_org_apikeys denies org members without org.update_user_roles permission'
);

SELECT tests.clear_authentication();
SELECT tests.authenticate_as('get_org_apikeys_admin');

SELECT ok(
  (
    SELECT COUNT(*)
    FROM public.get_org_apikeys('70000000-0000-4000-8000-000000000047'::uuid)
    WHERE id = 45047
  ) = 1,
  'get_org_apikeys allows org admins to enumerate relevant API keys'
);

SELECT ok(
  (
    SELECT COUNT(*)
    FROM public.get_org_apikeys('70000000-0000-4000-8000-000000000047'::uuid)
    WHERE id = 45048
  ) = 1,
  'get_org_apikeys includes keys with direct apikey org bindings even without owner org relation'
);

SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
