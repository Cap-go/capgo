BEGIN;

SELECT plan(2);

SELECT tests.create_supabase_user('legacy_apikey_effective_admin', 'legacy_apikey_effective_admin@test.local');
SELECT tests.create_supabase_user('legacy_apikey_effective_member', 'legacy_apikey_effective_member@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
  (tests.get_supabase_uid('legacy_apikey_effective_admin'), 'legacy_apikey_effective_admin@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('legacy_apikey_effective_member'), 'legacy_apikey_effective_member@test.local', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email, use_new_rbac)
VALUES (
  '70000000-0000-4000-8000-000000000046',
  tests.get_supabase_uid('legacy_apikey_effective_admin'),
  'Legacy API key effective user org',
  'legacy-apikey-effective@test.local',
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_users (user_id, org_id, user_right)
VALUES (
  tests.get_supabase_uid('legacy_apikey_effective_member'),
  '70000000-0000-4000-8000-000000000046',
  'read'::public.user_min_right
)
ON CONFLICT DO NOTHING;

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs)
VALUES (
  45046,
  tests.get_supabase_uid('legacy_apikey_effective_member'),
  'legacy-effective-user-key',
  'all'::public.key_mode,
  'legacy-effective-user-key',
  ARRAY['70000000-0000-4000-8000-000000000046'::uuid]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.apps (app_id, icon_url, user_id, name, owner_org)
VALUES (
  'com.test.legacyeffective.read',
  '',
  tests.get_supabase_uid('legacy_apikey_effective_member'),
  'Legacy Effective User App',
  '70000000-0000-4000-8000-000000000046'
)
ON CONFLICT (app_id) DO NOTHING;

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_org_read(),
    NULL::uuid,
    '70000000-0000-4000-8000-000000000046',
    NULL::varchar,
    NULL::bigint,
    'legacy-effective-user-key'
  ),
  'Legacy org permission resolves effective user from API key when p_user_id is null'
);

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    NULL::uuid,
    '70000000-0000-4000-8000-000000000046',
    'com.test.legacyeffective.read'::varchar,
    NULL::bigint,
    'legacy-effective-user-key'
  ),
  'Legacy app permission resolves effective user from API key when p_user_id is null'
);

SELECT * FROM finish();

ROLLBACK;
