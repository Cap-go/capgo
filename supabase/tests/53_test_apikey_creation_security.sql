BEGIN;

SELECT plan(6);

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

SELECT is(
  (
    SELECT count(*)::int
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'apikeys'
      AND column_name IN ('mode', 'limited_to_orgs', 'limited_to_apps')
  ),
  0,
  'apikeys no longer exposes old scope columns'
);

SELECT is(
  to_regprocedure('public.create_hashed_apikey(public.key_mode,text,uuid[],text[],timestamp with time zone)'),
  NULL::regprocedure,
  'old public key creation RPC is absent'
);

SELECT is(
  to_regprocedure('public.create_hashed_apikey_for_user(uuid,public.key_mode,text,uuid[],text[],timestamp with time zone)'),
  NULL::regprocedure,
  'old service key creation RPC is absent'
);

SELECT isnt(
  (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'apikeys'
      AND policyname = 'Deny client insert on apikeys'
  ),
  NULL,
  'client inserts into apikeys are explicitly denied'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'apikeys' AND policyname IN ('Allow owner to select own apikeys', 'Allow owner to delete own apikeys'))
        OR (tablename = 'users' AND policyname IN ('Allow owner to insert own users', 'Allow owner to select own user', 'Allow owner to update own users'))
        OR (tablename = 'orgs' AND policyname IN ('Allow insert org for apikey or user', 'Allow insert org for user'))
      )
      AND (
        COALESCE(qual, '') LIKE '%get_identity(%'
        OR COALESCE(with_check, '') LIKE '%get_identity(%'
      )
  ),
  0,
  'owner-scoped policies do not authorize through compatibility get_identity'
);

SELECT tests.clear_authentication();
SELECT tests.authenticate_as('apikey_creation_owner');

SELECT throws_ok(
  $q$
    INSERT INTO public.apikeys (user_id, key, name)
    VALUES (
      tests.get_supabase_uid('apikey_creation_owner'),
      'direct-insert-bypass',
      'direct-insert-bypass'
    );
  $q$,
  'new row violates row-level security policy for table "apikeys"',
  'authenticated users cannot create API keys by direct table insert'
);

SELECT set_config('request.headers', '{}', true);
SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
