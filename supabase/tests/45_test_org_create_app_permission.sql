BEGIN;

SELECT plan(6);

SELECT tests.create_supabase_user('org_create_app_admin', 'org_create_app_admin@test.local');
SELECT tests.create_supabase_user('org_create_app_member', 'org_create_app_member@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
  (tests.get_supabase_uid('org_create_app_admin'), 'org_create_app_admin@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('org_create_app_member'), 'org_create_app_member@test.local', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
VALUES
  ('70000000-0000-4000-8000-000000000001', tests.get_supabase_uid('org_create_app_admin'), 'Org Create App RBAC', 'org-create-app-rbac@test.local', true),
  ('70000000-0000-4000-8000-000000000002', tests.get_supabase_uid('org_create_app_admin'), 'Org Create App Legacy', 'org-create-app-legacy@test.local', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_users (user_id, org_id, user_right)
VALUES
  (tests.get_supabase_uid('org_create_app_member'), '70000000-0000-4000-8000-000000000002', 'read'::public.user_min_right)
ON CONFLICT DO NOTHING;

DELETE FROM public.role_bindings
WHERE principal_type = public.rbac_principal_user()
  AND principal_id = tests.get_supabase_uid('org_create_app_member')
  AND scope_type = public.rbac_scope_org()
  AND org_id = '70000000-0000-4000-8000-000000000001';

INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('org_create_app_member'),
  r.id,
  public.rbac_scope_org(),
  '70000000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('org_create_app_admin')
FROM public.roles r
WHERE r.name = public.rbac_role_org_member();

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs)
VALUES (
  45001,
  tests.get_supabase_uid('org_create_app_member'),
  'org-create-app-rbac-key',
  'all'::public.key_mode,
  'org-create-app-rbac-key',
  ARRAY['70000000-0000-4000-8000-000000000001'::uuid]
)
ON CONFLICT (id) DO NOTHING;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.permissions
    WHERE key = public.rbac_perm_org_create_app()
  ),
  'org.create_app permission is seeded'
);

SELECT ok(
  (
    SELECT COUNT(*)
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.name IN (
      public.rbac_role_org_member(),
      public.rbac_role_org_billing_admin(),
      public.rbac_role_org_admin(),
      public.rbac_role_org_super_admin()
    )
      AND p.key = public.rbac_perm_org_create_app()
  ) = 4,
  'org.create_app is granted to all org-level roles'
);

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_org_create_app(),
    tests.get_supabase_uid('org_create_app_member'),
    '70000000-0000-4000-8000-000000000001',
    NULL::varchar,
    NULL::bigint,
    NULL::text
  ),
  'RBAC org_member is allowed to create apps'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_create_app(),
    tests.get_supabase_uid('org_create_app_member'),
    '70000000-0000-4000-8000-000000000002',
    NULL::varchar,
    NULL::bigint,
    NULL::text
  ),
  'Legacy fallback for org.create_app remains stricter than org_member/read'
);

SELECT tests.authenticate_as('org_create_app_member');

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES (
  'com.test.orgcreateapp.rbac.user',
  '',
  tests.get_supabase_uid('org_create_app_member'),
  'Org Create App User',
  '70000000-0000-4000-8000-000000000001'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE app_id = 'com.test.orgcreateapp.rbac.user'
      AND owner_org = '70000000-0000-4000-8000-000000000001'
  ),
  'apps INSERT RLS allows RBAC org_member via authenticated user'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey": "org-create-app-rbac-key"}', true);

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES (
  'com.test.orgcreateapp.rbac.apikey',
  '',
  tests.get_supabase_uid('org_create_app_member'),
  'Org Create App API Key',
  '70000000-0000-4000-8000-000000000001'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE app_id = 'com.test.orgcreateapp.rbac.apikey'
      AND owner_org = '70000000-0000-4000-8000-000000000001'
  ),
  'apps INSERT RLS allows RBAC org_member via API key fallback'
);

SELECT set_config('request.headers', '{}', true);
SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
