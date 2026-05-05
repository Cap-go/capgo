BEGIN;

SELECT plan(8);

SELECT tests.authenticate_as_service_role();
SELECT tests.create_supabase_user('apikey_creation_owner', 'apikey_creation_owner@test.local');

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES (
  tests.get_supabase_uid('apikey_creation_owner'),
  'apikey_creation_owner@test.local',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email)
VALUES (
  '53000000-0000-4000-8000-000000000001',
  tests.get_supabase_uid('apikey_creation_owner'),
  'API key creation security org',
  'apikey-creation-security@test.local'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs)
VALUES (
  53001,
  tests.get_supabase_uid('apikey_creation_owner'),
  'apikey-create-limited-key',
  'all'::public.key_mode,
  'apikey-create-limited-key',
  ARRAY['53000000-0000-4000-8000-000000000001'::uuid]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.apikeys (id, user_id, key, mode, name, limited_to_orgs, limited_to_apps)
VALUES (
  53002,
  tests.get_supabase_uid('apikey_creation_owner'),
  'apikey-create-all-key',
  'all'::public.key_mode,
  'apikey-create-all-key',
  '{}'::uuid[],
  '{}'::text[]
)
ON CONFLICT (id) DO NOTHING;

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey": "apikey-create-limited-key"}', true);

SELECT is(
  public.get_identity_for_apikey_creation(),
  NULL,
  'limited API key is not accepted as an API key creation identity'
);

SELECT throws_ok(
  $q$
    SELECT *
    FROM public.create_hashed_apikey(
      'all'::public.key_mode,
      'limited-rpc-bypass',
      '{}'::uuid[],
      '{}'::text[],
      NULL::timestamptz
    );
  $q$,
  'No authentication provided',
  'limited API key cannot create a broader key through create_hashed_apikey RPC'
);

SELECT throws_ok(
  $q$
    INSERT INTO public.apikeys (user_id, key, mode, name, limited_to_orgs, limited_to_apps)
    VALUES (
      tests.get_supabase_uid('apikey_creation_owner'),
      'limited-direct-insert-bypass',
      'all'::public.key_mode,
      'limited-direct-insert-bypass',
      '{}'::uuid[],
      '{}'::text[]
    );
  $q$,
  'new row violates row-level security policy for table "apikeys"',
  'limited API key cannot create a broader key through direct table insert'
);

UPDATE public.apikeys
SET limited_to_orgs = '{}'::uuid[]
WHERE id = 53001;

SELECT tests.authenticate_as_service_role();
SELECT is(
  (SELECT array_length(limited_to_orgs, 1) FROM public.apikeys WHERE id = 53001),
  1,
  'limited API key cannot widen itself through direct table update'
);

SELECT tests.clear_authentication();
SELECT set_config('request.headers', '{"capgkey": "apikey-create-all-key"}', true);

SELECT is(
  public.get_identity_for_apikey_creation(),
  tests.get_supabase_uid('apikey_creation_owner'),
  'unrestricted all API key is accepted as an API key creation identity'
);

SELECT lives_ok(
  $q$
    SELECT *
    FROM public.create_hashed_apikey(
      'read'::public.key_mode,
      'unrestricted-rpc-create',
      '{}'::uuid[],
      '{}'::text[],
      NULL::timestamptz
    );
  $q$,
  'unrestricted all API key can still create a legacy hashed key'
);

SELECT throws_ok(
  $q$
    SELECT *
    FROM public.create_hashed_apikey(
      NULL::public.key_mode,
      'null-mode-rpc-bypass',
      '{}'::uuid[],
      '{}'::text[],
      NULL::timestamptz
    );
  $q$,
  'RBAC_MANAGED_APIKEY_REQUIRES_BINDINGS',
  'public create_hashed_apikey rejects null-mode RBAC keys without bindings'
);

SELECT tests.clear_authentication();
SELECT tests.authenticate_as('apikey_creation_owner');

SELECT throws_ok(
  $q$
    INSERT INTO public.apikeys (user_id, key, mode, name, limited_to_orgs, limited_to_apps)
    VALUES (
      tests.get_supabase_uid('apikey_creation_owner'),
      'jwt-null-mode-direct-insert',
      NULL::public.key_mode,
      'jwt-null-mode-direct-insert',
      '{}'::uuid[],
      '{}'::text[]
    );
  $q$,
  'new row violates row-level security policy for table "apikeys"',
  'authenticated users cannot create null-mode API keys without role bindings by direct insert'
);

SELECT set_config('request.headers', '{}', true);
SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
