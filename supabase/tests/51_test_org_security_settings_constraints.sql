BEGIN;

SELECT plan(5);

SELECT tests.authenticate_as_service_role();

SELECT lives_ok(
  $$
    UPDATE public.orgs
    SET
      max_apikey_expiration_days = 365,
      required_encryption_key = repeat('a', 20)
    WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  $$,
  'orgs accepts valid security setting values'
);

SELECT throws_ok(
  $$
    UPDATE public.orgs
    SET max_apikey_expiration_days = -1
    WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  $$,
  '23514',
  'new row for relation "orgs" violates check constraint "orgs_max_apikey_expiration_days_valid"',
  'orgs rejects negative max API key expiration days'
);

SELECT throws_ok(
  $$
    UPDATE public.orgs
    SET max_apikey_expiration_days = 366
    WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  $$,
  '23514',
  'new row for relation "orgs" violates check constraint "orgs_max_apikey_expiration_days_valid"',
  'orgs rejects oversized max API key expiration days'
);

SELECT throws_ok(
  $$
    UPDATE public.orgs
    SET required_encryption_key = 'short'
    WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  $$,
  '23514',
  'new row for relation "orgs" violates check constraint "orgs_required_encryption_key_valid"',
  'orgs rejects invalid encryption key fingerprints'
);

SELECT lives_ok(
  $$
    UPDATE public.orgs
    SET
      max_apikey_expiration_days = NULL,
      required_encryption_key = NULL
    WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  $$,
  'orgs accepts unset optional security setting values'
);

SELECT * FROM finish();

ROLLBACK;
