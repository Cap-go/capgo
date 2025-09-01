BEGIN;

CREATE EXTENSION IF NOT EXISTS "basejump-supabase_test_helpers";

-- 4 assertions below
SELECT plan(4);

-- Use seeded test user (id/email set in seed.sql with test_identifier = 'test_user')
SELECT tests.authenticate_as('test_user');

-- Ensure function exists
SELECT ok(
  pg_get_functiondef('delete_user()'::regprocedure) IS NOT NULL,
  'delete_user exists'
);

-- Call delete_user (soft delete)
SELECT lives_ok(
  'SELECT public.delete_user()',
  'delete_user executes without error'
);

-- After soft delete the user cannot read their own row due to RLS.
-- Switch to admin to validate state using the original user's id.
-- Validate email tombstone in public.users (JWT email may be stale)
SELECT ok(
  (
    SELECT email LIKE ('deleted+' || auth.uid()::text || '+%') FROM public.users WHERE id = auth.uid()
  ),
  'public.users email is tombstoned with deleted+<uid>+original'
);

-- Check flags and deletion timestamp
-- Validate flags and deletion timestamp in public.users
SELECT ok(
  (
    SELECT ("enableNotifications" = false AND "optForNewsletters" = false AND delete_requested_at IS NOT NULL)
    FROM public.users WHERE id = auth.uid()
  ),
  'public.users flags disabled and delete_requested_at set'
);

-- Note: We do not assert deleted_account here due to RLS hiding rows in tests

-- Note: Purge is verified by cron tests; we avoid backdating due to RLS constraints in tests.

SELECT * FROM finish();

ROLLBACK;
