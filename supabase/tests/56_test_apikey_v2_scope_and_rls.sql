BEGIN;

SELECT plan(43);

SELECT tests.authenticate_as_service_role();
SELECT tests.create_supabase_user('apikey_v2_scope_owner', 'apikey_v2_scope_owner@test.local');
SELECT tests.create_supabase_user('apikey_v2_scope_upload_user', 'apikey_v2_scope_upload_user@test.local');
SELECT tests.create_supabase_user('apikey_v2_scope_legacy_user', 'apikey_v2_scope_legacy_user@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES (
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey_v2_scope_owner@test.local',
  NOW(),
  NOW()
),
(
  tests.get_supabase_uid('apikey_v2_scope_upload_user'),
  'apikey_v2_scope_upload_user@test.local',
  NOW(),
  NOW()
),
(
  tests.get_supabase_uid('apikey_v2_scope_legacy_user'),
  'apikey_v2_scope_legacy_user@test.local',
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
  public.rbac_role_apikey_org_reader(),
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
  public.rbac_role_apikey_org_reader(),
  'com.test.apikeyv2scope.target',
  public.rbac_role_app_reader()
);

SELECT tests.create_v2_apikey(
  56004,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey-v2-scope-upload-key',
  'apikey-v2-scope-upload-key',
  '71000000-0000-4000-8000-000000000056'::uuid,
  public.rbac_role_apikey_org_reader(),
  'com.test.apikeyv2scope.target',
  public.rbac_role_app_uploader()
);

SELECT tests.create_v2_apikey(
  56005,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'apikey-v2-scope-all-app-key',
  'apikey-v2-scope-all-app-key',
  '71000000-0000-4000-8000-000000000056'::uuid,
  public.rbac_role_apikey_org_reader(),
  'com.test.apikeyv2scope.target',
  public.rbac_role_app_admin()
);

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
  tests.get_supabase_uid('apikey_v2_scope_upload_user'),
  roles.id,
  public.rbac_scope_org(),
  '71000000-0000-4000-8000-000000000056'::uuid,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'pgTAP upload-only user org membership',
  true
FROM public.roles
WHERE roles.name = public.rbac_role_org_member()
ON CONFLICT DO NOTHING;

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  app_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_user(),
  tests.get_supabase_uid('apikey_v2_scope_upload_user'),
  roles.id,
  public.rbac_scope_app(),
  '71000000-0000-4000-8000-000000000056'::uuid,
  apps.id,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'pgTAP upload-only user app binding',
  true
FROM public.roles
JOIN public.apps ON apps.app_id = 'com.test.apikeyv2scope.target'
WHERE roles.name = public.rbac_role_app_uploader()
ON CONFLICT DO NOTHING;

INSERT INTO public.org_users (
  user_id,
  org_id,
  app_id,
  user_right
)
VALUES (
  tests.get_supabase_uid('apikey_v2_scope_legacy_user'),
  '71000000-0000-4000-8000-000000000056'::uuid,
  'com.test.apikeyv2scope.target',
  'upload'::public.user_min_right
);

DELETE FROM public.role_bindings
WHERE principal_type = public.rbac_principal_user()
  AND principal_id = tests.get_supabase_uid('apikey_v2_scope_legacy_user')
  AND org_id = '71000000-0000-4000-8000-000000000056'::uuid;

INSERT INTO public.app_versions (
  id,
  app_id,
  name,
  owner_org,
  comment
)
VALUES (
  5600401,
  'com.test.apikeyv2scope.target',
  '1.0.0-apikey-v2-scope',
  '71000000-0000-4000-8000-000000000056'::uuid,
  'initial'
)
ON CONFLICT (id) DO UPDATE
SET comment = EXCLUDED.comment;

INSERT INTO public.channels (
  id,
  created_at,
  name,
  app_id,
  version,
  updated_at,
  public,
  disable_auto_update_under_native,
  disable_auto_update,
  ios,
  android,
  electron,
  allow_device_self_set,
  allow_emulator,
  allow_device,
  allow_dev,
  allow_prod,
  owner_org,
  created_by
)
VALUES (
  5600401,
  NOW(),
  'apikey-v2-scope-channel',
  'com.test.apikeyv2scope.target',
  5600401,
  NOW(),
  true,
  true,
  'major'::public.disable_update,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  '71000000-0000-4000-8000-000000000056'::uuid,
  tests.get_supabase_uid('apikey_v2_scope_owner')
)
ON CONFLICT (id) DO UPDATE
SET
  app_id = EXCLUDED.app_id,
  version = EXCLUDED.version,
  owner_org = EXCLUDED.owner_org,
  created_by = EXCLUDED.created_by;

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
    'apikey-v2-scope-app-key'
  ),
  'app-limited legacy migration shape keeps org.read compatibility'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM public.apikeys ak
    JOIN public.role_bindings rb
      ON rb.principal_type = public.rbac_principal_apikey()
      AND rb.principal_id = ak.rbac_id
    JOIN public.roles r ON r.id = rb.role_id
    WHERE ak.key = 'apikey-v2-scope-app-key'
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name = public.rbac_role_apikey_org_reader()
  ),
  1,
  'app-limited legacy migration shape uses the API-key org reader compatibility role'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM public.apikeys ak
    JOIN public.role_bindings rb
      ON rb.principal_type = public.rbac_principal_apikey()
      AND rb.principal_id = ak.rbac_id
    JOIN public.roles r ON r.id = rb.role_id
    WHERE ak.key = 'apikey-v2-scope-app-key'
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name = public.rbac_role_org_member()
  ),
  0,
  'app-limited legacy migration shape does not use org_member compatibility binding'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.name = public.rbac_role_apikey_org_reader()
      AND p.key = public.rbac_perm_app_read()
  ),
  'API-key org reader role does not grant app.read at org scope'
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

SELECT ok(
  public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.target',
    NULL::bigint,
    'apikey-v2-scope-all-app-key'
  ),
  'all-mode app-limited legacy key gets app admin on the selected app'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    'com.test.apikeyv2scope.sibling',
    NULL::bigint,
    'apikey-v2-scope-all-app-key'
  ),
  'all-mode app-limited legacy key does not get app admin on sibling apps'
);

SELECT ok(
  NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_update_user_roles(),
    NULL::uuid,
    '71000000-0000-4000-8000-000000000056',
    NULL::varchar,
    NULL::bigint,
    'apikey-v2-scope-all-app-key'
  ),
  'all-mode app-limited legacy key does not become an org admin'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-app-key"}', true);

SELECT is(
  ARRAY(SELECT unnest(public.app_versions_readable_app_ids()) ORDER BY 1),
  ARRAY['com.test.apikeyv2scope.target']::character varying[],
  'app_versions readable app helper only returns app-scoped API key apps'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-org-key"}', true);

SELECT is(
  ARRAY(SELECT unnest(public.app_versions_readable_app_ids()) ORDER BY 1),
  ARRAY[
    'com.test.apikeyv2scope.sibling',
    'com.test.apikeyv2scope.target'
  ]::character varying[],
  'app_versions readable app helper expands org-scoped API key bindings set-wise'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-all-app-key"}', true);

SELECT is(
  ARRAY(SELECT unnest(public.app_versions_readable_app_ids()) ORDER BY 1),
  ARRAY['com.test.apikeyv2scope.target']::character varying[],
  'app_versions readable app helper keeps app-admin API keys app-scoped'
);

SELECT tests.authenticate_as_service_role();
SELECT set_config('request.headers', '{}', true);

INSERT INTO public.apps (app_id, icon_url, user_id, name, last_version, owner_org)
SELECT
  'com.test.apikeyv2scope.perf.' || gs::text,
  '',
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'API key V2 perf app ' || gs::text,
  '1.0.0-apikey-v2-perf',
  '71000000-0000-4000-8000-000000000056'::uuid
FROM generate_series(1, 75) gs
ON CONFLICT (app_id) DO NOTHING;

INSERT INTO public.app_versions (
  app_id,
  name,
  owner_org,
  storage_provider,
  comment
)
SELECT
  'com.test.apikeyv2scope.perf.' || gs::text,
  '1.0.0-apikey-v2-perf',
  '71000000-0000-4000-8000-000000000056'::uuid,
  'r2-direct',
  'perf seed'
FROM generate_series(1, 75) gs
ON CONFLICT (name, app_id) DO UPDATE
SET
  storage_provider = EXCLUDED.storage_provider,
  r2_path = NULL,
  comment = EXCLUDED.comment;

INSERT INTO public.role_bindings (
  principal_type,
  principal_id,
  role_id,
  scope_type,
  org_id,
  app_id,
  granted_by,
  reason,
  is_direct
)
SELECT
  public.rbac_principal_apikey(),
  apikeys.rbac_id,
  roles.id,
  public.rbac_scope_app(),
  apps.owner_org,
  apps.id,
  tests.get_supabase_uid('apikey_v2_scope_owner'),
  'pgTAP broad app-scoped API key performance regression',
  true
FROM public.apikeys
JOIN public.roles ON roles.name = public.rbac_role_app_admin()
JOIN public.apps ON apps.app_id LIKE 'com.test.apikeyv2scope.perf.%'
WHERE apikeys.key = 'apikey-v2-scope-all-app-key'
ON CONFLICT DO NOTHING;

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-all-app-key"}', true);
SELECT set_config('request.method', 'PATCH', true);

WITH updated_rows AS (
  UPDATE public.app_versions
  SET r2_path = 'orgs/71000000-0000-4000-8000-000000000056/apps/com.test.apikeyv2scope.perf.1/1.0.0-apikey-v2-perf.zip'
  WHERE app_id = 'com.test.apikeyv2scope.perf.1'
    AND name = '1.0.0-apikey-v2-perf'
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM updated_rows),
  1,
  'broad app-scoped API key can finish the indexed app_versions upload update'
);

SELECT set_config('request.method', '', true);

SELECT ok(
  position(
    'rbac_check_permission_direct'
    in pg_get_functiondef('public.app_versions_readable_app_ids()'::regprocedure)
  ) = 0,
  'app_versions readable app helper does not use per-app RBAC checks'
);

SELECT ok(
  position(
    'rbac_check_permission_direct'
    in pg_get_functiondef('public.app_versions_has_app_permission(public.user_min_right,uuid,character varying,uuid,text)'::regprocedure)
  ) = 0,
  'app_versions targeted permission helper does not call generic per-app RBAC checks'
);

SELECT ok(
  position(
    'enforced_orgs'
    in pg_get_functiondef('public.check_apikey_hashed_key_enforcement(public.apikeys)'::regprocedure)
  ) > 0,
  'API key hashed-key enforcement starts from enforcing orgs instead of every scoped app binding'
);

SELECT ok(
  (
    SELECT position('CASE WHEN' in normalized_expr) > 0
      AND position('request.method' in normalized_expr) > 0
      AND position('PATCH' in normalized_expr) > 0
      AND position('THEN' in normalized_expr) > 0
      AND position('ELSE' in normalized_expr) > position('THEN' in normalized_expr)
      AND position('app_versions_has_app_permission' in normalized_expr) > position('THEN' in normalized_expr)
      AND position('app_versions_has_app_permission' in normalized_expr) < position('ELSE' in normalized_expr)
      AND position('app_versions_readable_app_ids' in substring(normalized_expr from position('ELSE' in normalized_expr))) > 0
      AND position('app_versions_has_app_permission' in substring(normalized_expr from position('ELSE' in normalized_expr))) = 0
    FROM (
      SELECT regexp_replace(pg_get_expr(polqual, polrelid), '\s+', ' ', 'g') AS normalized_expr
      FROM pg_policy
      WHERE polrelid = 'public.app_versions'::regclass
        AND polname = 'Allow for auth, api keys (read+)'
    ) policy
  ),
  'app_versions select policy uses targeted helper only behind write-method guard'
);

SELECT ok(
  public.app_versions_has_app_permission(
    'upload'::public.user_min_right,
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.target',
    NULL::uuid,
    'apikey-v2-scope-upload-key'
  ),
  'targeted app_versions permission helper allows upload API key on its app'
);

SELECT ok(
  NOT public.app_versions_has_app_permission(
    'upload'::public.user_min_right,
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.sibling',
    NULL::uuid,
    'apikey-v2-scope-upload-key'
  ),
  'targeted app_versions permission helper keeps upload API key app-scoped'
);

SELECT ok(
  public.app_versions_has_app_permission(
    'upload'::public.user_min_right,
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.target',
    tests.get_supabase_uid('apikey_v2_scope_legacy_user'),
    NULL::text
  ),
  'targeted app_versions permission helper keeps legacy org_users upload access for authenticated users'
);

SELECT ok(
  NOT public.app_versions_has_app_permission(
    'upload'::public.user_min_right,
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.sibling',
    tests.get_supabase_uid('apikey_v2_scope_legacy_user'),
    NULL::text
  ),
  'targeted app_versions permission helper keeps legacy org_users app scope bounded'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM public.app_versions
    WHERE app_id = 'com.test.apikeyv2scope.target'
      AND name = '1.0.0-apikey-v2-scope'
  ),
  1,
  'app-scoped API key can still select its app_versions row through RLS'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{}', true);

SELECT ok(
  public.check_min_rights(
    'upload'::public.user_min_right,
    tests.get_supabase_uid('apikey_v2_scope_upload_user'),
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.target',
    NULL::bigint
  ),
  'JWT upload-only fixture has upload permission'
);

SELECT ok(
  NOT public.check_min_rights(
    'write'::public.user_min_right,
    tests.get_supabase_uid('apikey_v2_scope_upload_user'),
    '71000000-0000-4000-8000-000000000056'::uuid,
    'com.test.apikeyv2scope.target',
    NULL::bigint
  ),
  'JWT upload-only fixture does not have write permission'
);

SELECT tests.authenticate_as('apikey_v2_scope_upload_user');

WITH updated_rows AS (
  UPDATE public.app_versions
  SET comment = 'blocked-jwt-upload-only'
  WHERE id = 5600401
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM updated_rows),
  0,
  'authenticated upload-only user cannot update app_versions through write-only JWT path'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-upload-key"}', true);

WITH updated_rows AS (
  UPDATE public.app_versions
  SET comment = 'allowed-apikey-upload'
  WHERE id = 5600401
  RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM updated_rows),
  1,
  'upload-scoped API key can update app_versions through old upload path'
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

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-all-app-key"}', true);

DO $$
DECLARE
  captured_sqlstate text;
BEGIN
  BEGIN
    INSERT INTO public.channel_devices (
      channel_id,
      app_id,
      device_id,
      owner_org
    )
    VALUES (
      5600401,
      'com.test.apikeyv2scope.target',
      'apikey-v2-scope-channel-device',
      '71000000-0000-4000-8000-000000000056'::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    captured_sqlstate := SQLSTATE;
  END;

  PERFORM set_config('tests.channel_devices_apikey_insert_sqlstate', COALESCE(captured_sqlstate, 'success'), true);
END $$;

SELECT is(
  current_setting('tests.channel_devices_apikey_insert_sqlstate', true),
  '42501',
  'API keys cannot directly insert channel_devices through JWT-only RLS'
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

SELECT set_config('request.headers', '{"capgkey":"apikey-v2-scope-app-key"}', true);

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
