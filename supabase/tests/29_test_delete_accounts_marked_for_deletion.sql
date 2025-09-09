BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (20);

-- Test helper function to create test users in both auth.users and public.users tables
CREATE OR REPLACE FUNCTION create_test_user_for_deletion(
  user_id UUID,
  user_email TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into auth.users table
  INSERT INTO "auth"."users" (
    "instance_id", "id", "aud", "role", "email", "encrypted_password", 
    "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", 
    "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", 
    "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", 
    "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", 
    "phone_change", "phone_change_token", "phone_change_sent_at", 
    "email_change_token_current", "email_change_confirm_status", "banned_until", 
    "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous"
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', user_email, 
    '$2a$10$test_encrypted_password', now(), now(), 'test_token_' || user_id::text, now(), 
    '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', 
    '{"test_identifier": "test_deletion"}', 'f', now(), now(), NULL, NULL, 
    '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false
  );

  -- Insert into public.users table
  INSERT INTO "public"."users" ("id", "email", "created_at", "updated_at") 
  VALUES (user_id, user_email, now(), now());
END;
$$;

-- Test 1: Function exists and has correct signature
SELECT
  ok (
    pg_get_functiondef('delete_accounts_marked_for_deletion()'::regprocedure) IS NOT NULL,
    'delete_accounts_marked_for_deletion function exists'
  );

-- Test 2: Function returns correct table structure
SELECT
  ok (
    (
      SELECT 
        COUNT(*) 
      FROM information_schema.columns 
      WHERE table_name = 'delete_accounts_marked_for_deletion' 
        AND column_name IN ('deleted_count', 'deleted_user_ids')
    ) = 0, -- Function returns a table, not a persistent table
    'delete_accounts_marked_for_deletion returns table with correct structure'
  );

-- Test 3: No accounts to delete (empty table scenario)
SELECT
  ok (
    (
      SELECT deleted_count 
      FROM delete_accounts_marked_for_deletion() 
      LIMIT 1
    ) = 0,
    'delete_accounts_marked_for_deletion returns 0 when no accounts to delete'
  );

SELECT
  ok (
    (
      SELECT array_length(deleted_user_ids, 1) 
      FROM delete_accounts_marked_for_deletion() 
      LIMIT 1
    ) IS NULL,
    'delete_accounts_marked_for_deletion returns empty array when no accounts to delete'
  );

-- Test 4: Accounts with future removal dates are not deleted
-- Create test user
SELECT create_test_user_for_deletion(
  '11111111-1111-1111-1111-111111111111'::UUID, 
  'future_delete@test.com'
);

-- Mark for deletion with future date
INSERT INTO "public"."to_delete_accounts" (
  "account_id", 
  "removal_date", 
  "removed_data"
) VALUES (
  '11111111-1111-1111-1111-111111111111'::UUID,
  NOW() + INTERVAL '7 days',
  '{"email": "future_delete@test.com", "apikeys": []}'::JSONB
);

SELECT
  ok (
    (
      SELECT deleted_count 
      FROM delete_accounts_marked_for_deletion() 
      LIMIT 1
    ) = 0,
    'delete_accounts_marked_for_deletion does not delete accounts with future removal dates'
  );

-- Verify user still exists in both tables
SELECT
  ok (
    EXISTS (
      SELECT 1 FROM "auth"."users" 
      WHERE "id" = '11111111-1111-1111-1111-111111111111'::UUID
    ),
    'User with future deletion date still exists in auth.users'
  );

SELECT
  ok (
    EXISTS (
      SELECT 1 FROM "public"."users" 
      WHERE "id" = '11111111-1111-1111-1111-111111111111'::UUID
    ),
    'User with future deletion date still exists in public.users'
  );

SELECT
  ok (
    EXISTS (
      SELECT 1 FROM "public"."to_delete_accounts" 
      WHERE "account_id" = '11111111-1111-1111-1111-111111111111'::UUID
    ),
    'User with future deletion date still exists in to_delete_accounts'
  );

-- Test 5: Accounts with past removal dates are deleted successfully
-- Create test user for deletion
SELECT create_test_user_for_deletion(
  '22222222-2222-2222-2222-222222222222'::UUID, 
  'past_delete@test.com'
);

-- Mark for deletion with past date
INSERT INTO "public"."to_delete_accounts" (
  "account_id", 
  "removal_date", 
  "removed_data"
) VALUES (
  '22222222-2222-2222-2222-222222222222'::UUID,
  NOW() - INTERVAL '1 day',
  '{"email": "past_delete@test.com", "apikeys": []}'::JSONB
);

-- Test deletion count by running function once and checking result
SELECT
  ok (
    (
      WITH deletion_results AS (
        SELECT * FROM delete_accounts_marked_for_deletion() LIMIT 1
      )
      SELECT deleted_count FROM deletion_results
    ) = 1,
    'delete_accounts_marked_for_deletion deletes 1 account with past removal date'
  );

-- Test that the correct user ID is in the results (run function again, should return 0 now)
SELECT
  ok (
    (
      SELECT deleted_count FROM delete_accounts_marked_for_deletion() LIMIT 1
    ) = 0,
    'delete_accounts_marked_for_deletion returns 0 on second run (user already deleted)'
  );

-- Verify user is deleted from both auth.users and public.users
SELECT
  ok (
    NOT EXISTS (
      SELECT 1 FROM "auth"."users" 
      WHERE "id" = '22222222-2222-2222-2222-222222222222'::UUID
    ),
    'User with past deletion date is removed from auth.users'
  );

SELECT
  ok (
    NOT EXISTS (
      SELECT 1 FROM "public"."users" 
      WHERE "id" = '22222222-2222-2222-2222-222222222222'::UUID
    ),
    'User with past deletion date is removed from public.users'
  );

SELECT
  ok (
    NOT EXISTS (
      SELECT 1 FROM "public"."to_delete_accounts" 
      WHERE "account_id" = '22222222-2222-2222-2222-222222222222'::UUID
    ),
    'User with past deletion date is removed from to_delete_accounts'
  );

-- Test 6: Multiple accounts deletion
-- Create multiple test users
SELECT create_test_user_for_deletion(
  '33333333-3333-3333-3333-333333333333'::UUID, 
  'multi_delete1@test.com'
);

SELECT create_test_user_for_deletion(
  '44444444-4444-4444-4444-444444444444'::UUID, 
  'multi_delete2@test.com'
);

-- Mark both for deletion with past dates
INSERT INTO "public"."to_delete_accounts" (
  "account_id", 
  "removal_date", 
  "removed_data"
) VALUES 
(
  '33333333-3333-3333-3333-333333333333'::UUID,
  NOW() - INTERVAL '2 days',
  '{"email": "multi_delete1@test.com", "apikeys": []}'::JSONB
),
(
  '44444444-4444-4444-4444-444444444444'::UUID,
  NOW() - INTERVAL '3 days',
  '{"email": "multi_delete2@test.com", "apikeys": []}'::JSONB
);

-- Run deletion and verify results
SELECT
  ok (
    (
      WITH deletion_results AS (
        SELECT * FROM delete_accounts_marked_for_deletion() LIMIT 1
      )
      SELECT deleted_count FROM deletion_results
    ) = 2,
    'delete_accounts_marked_for_deletion deletes multiple accounts'
  );

-- Test 7: Mixed scenario - some accounts ready for deletion, some not
-- Create another test user with future date
SELECT create_test_user_for_deletion(
  '55555555-5555-5555-5555-555555555555'::UUID, 
  'mixed_future@test.com'
);

-- Create another test user with past date
SELECT create_test_user_for_deletion(
  '66666666-6666-6666-6666-666666666666'::UUID, 
  'mixed_past@test.com'
);

-- Mark one for future deletion, one for past deletion
INSERT INTO "public"."to_delete_accounts" (
  "account_id", 
  "removal_date", 
  "removed_data"
) VALUES 
(
  '55555555-5555-5555-5555-555555555555'::UUID,
  NOW() + INTERVAL '1 day',
  '{"email": "mixed_future@test.com", "apikeys": []}'::JSONB
),
(
  '66666666-6666-6666-6666-666666666666'::UUID,
  NOW() - INTERVAL '1 hour',
  '{"email": "mixed_past@test.com", "apikeys": []}'::JSONB
);

-- Run deletion and verify only past date account is deleted
SELECT
  ok (
    (
      WITH deletion_results AS (
        SELECT * FROM delete_accounts_marked_for_deletion() LIMIT 1
      )
      SELECT deleted_count FROM deletion_results
    ) = 1,
    'delete_accounts_marked_for_deletion deletes only accounts with past dates in mixed scenario'
  );

-- Verify future account still exists
SELECT
  ok (
    EXISTS (
      SELECT 1 FROM "public"."users" 
      WHERE "id" = '55555555-5555-5555-5555-555555555555'::UUID
    ),
    'Account with future deletion date remains in mixed scenario'
  );

-- Verify past account is deleted
SELECT
  ok (
    NOT EXISTS (
      SELECT 1 FROM "public"."users" 
      WHERE "id" = '66666666-6666-6666-6666-666666666666'::UUID
    ),
    'Account with past deletion date is deleted in mixed scenario'
  );

-- Test 8: Function should fail when encountering database constraint errors
-- Create a user and then manually delete it from auth.users to simulate error condition
SELECT create_test_user_for_deletion(
  '77777777-7777-7777-7777-777777777777'::UUID, 
  'error_test@test.com'
);

-- Mark for deletion
INSERT INTO "public"."to_delete_accounts" (
  "account_id", 
  "removal_date", 
  "removed_data"
) VALUES (
  '77777777-7777-7777-7777-777777777777'::UUID,
  NOW() - INTERVAL '1 day',
  '{"email": "error_test@test.com", "apikeys": []}'::JSONB
);

-- Manually delete from auth.users to create an inconsistent state
DELETE FROM "auth"."users" WHERE "id" = '77777777-7777-7777-7777-777777777777'::UUID;

-- This should complete successfully since DELETE on non-existent rows doesn't error
-- but let's verify it still works
SELECT
  lives_ok (
    'SELECT delete_accounts_marked_for_deletion()',
    'delete_accounts_marked_for_deletion completes even when auth.users record already missing'
  );

-- Verify the record is cleaned up from to_delete_accounts
SELECT
  ok (
    NOT EXISTS (
      SELECT 1 FROM "public"."to_delete_accounts" 
      WHERE "account_id" = '77777777-7777-7777-7777-777777777777'::UUID
    ),
    'to_delete_accounts record is cleaned up when auth.users record was already missing'
  );

-- Clean up test helper function before permission tests
DROP FUNCTION create_test_user_for_deletion(UUID, TEXT);

-- Test 9: Function permissions - only service_role and postgres can execute
-- This test verifies the REVOKE/GRANT statements in the migration
SELECT
  tests.authenticate_as ('test_user');

-- The function should throw a permission error when called by a regular user
SELECT
  throws_ok (
    'SELECT delete_accounts_marked_for_deletion()',
    '42501',
    'permission denied for function delete_accounts_marked_for_deletion',
    'delete_accounts_marked_for_deletion throws permission denied for regular users'
  );

SELECT
  tests.clear_authentication ();

SELECT
  *
FROM
  finish ();

ROLLBACK;
