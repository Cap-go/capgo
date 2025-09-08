-- Reproduce org creation behavior with API key vs JWT (RLS)
-- This test isolates the INSERT INTO public.orgs policy behavior
-- Expectation: INSERT with API key context (anon role + capgkey header) fails due to RLS
--              INSERT with JWT-authenticated context succeeds
BEGIN;

-- Use existing seed identities from supabase/seed.sql and tests/test-utils.ts
-- API key: ae6e7458-c46d-4c00-aa3b-153b0b8520ea (belongs to USER_ID below)
-- USER_ID: 6aa76066-55ef-4238-ade6-0b32334a4097
SELECT
  plan (2);

-- Test 1: Try to create an org using API key context (anon role + capgkey header)
SET
  LOCAL role TO anon;

-- Simulate PostgREST headers so RLS helper functions can read the API key
select
  set_config(
    'request.headers',
    '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}',
    true
  );

SELECT
  throws_ok (
    $$
    INSERT INTO public.orgs (created_by, name, management_email)
    VALUES ('6aa76066-55ef-4238-ade6-0b32334a4097', 'SQL Apikey Org', 'test@capgo.app')
  $$,
    '42501',
    'new row violates row-level security policy for table "orgs"',
    'INSERT via API key should be blocked by RLS (anon role)'
  );

-- Test 2: Create an org using JWT-authenticated context (policy requires authenticated role)
SET
  LOCAL role TO authenticated;

SET
  LOCAL request.jwt.claims TO '{"sub": "6aa76066-55ef-4238-ade6-0b32334a4097"}';

SELECT
  lives_ok (
    $$
    INSERT INTO public.orgs (created_by, name, management_email)
    VALUES ('6aa76066-55ef-4238-ade6-0b32334a4097', 'SQL JWT Org', 'test@capgo.app')
    RETURNING id
  $$,
    'INSERT via authenticated user should succeed'
  );

-- Finish
SELECT
  *
FROM
  finish ();

-- Roll back any changes done in this test
ROLLBACK;
