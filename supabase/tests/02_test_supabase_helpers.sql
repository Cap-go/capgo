BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (1);

-- create a table, which will have RLS disabled by default
CREATE TABLE public.tb1 (id int, data text);

ALTER TABLE public.tb1 ENABLE ROW LEVEL SECURITY;

-- test to make sure RLS check works
SELECT
  check_test (tests.rls_enabled ('public', 'tb1'), true);

SELECT
  *
FROM
  finish ();

ROLLBACK;
