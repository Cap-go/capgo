BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(4);

-- Set up test data
SELECT tests.create_supabase_user('test_admin', 'admin@example.com');
SELECT tests.create_supabase_user('test_user', 'user@example.com');

INSERT INTO users (id, email) 
VALUES (tests.get_supabase_uid('test_admin'), 'admin@example.com'),
       (tests.get_supabase_uid('test_user'), 'user@example.com');

ALTER TABLE "public"."orgs" DISABLE ROW LEVEL SECURITY; -- TODO: find why RLS won't works with tests
ALTER TABLE "public"."org_users" DISABLE ROW LEVEL SECURITY; -- TODO: find why RLS won't works with tests

-- Create a new organization for testing
-- SELECT tests.authenticate_as('test_admin');
-- INSERT INTO orgs (id, created_by, name, management_email) 
-- VALUES (gen_random_uuid(), tests.get_supabase_uid('test_admin'), 'Test Org', 'admin@example.com');
-- SELECT tests.clear_authentication();

-- Test 1: Check if the function returns 'NO_INVITE' when there's no invite
SELECT tests.authenticate_as('test_user');
SELECT is(accept_invitation_to_org((SELECT id FROM orgs WHERE created_by = tests.get_supabase_uid('test_admin'))), 'NO_INVITE', 'accept_invitation_to_org test - no invite');
SELECT tests.clear_authentication();

-- Test 2: Check if the function returns 'INVALID_ROLE' when the user_right is not an invite role
SELECT tests.authenticate_as('test_admin');
INSERT INTO org_users (org_id, user_id, user_right) 
VALUES ((SELECT id FROM orgs WHERE created_by = tests.get_supabase_uid('test_admin')), tests.get_supabase_uid('test_user'), 'read');
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('test_user');
SELECT is(accept_invitation_to_org((SELECT id FROM orgs WHERE created_by = tests.get_supabase_uid('test_admin'))), 'INVALID_ROLE', 'accept_invitation_to_org test - invalid role');
SELECT tests.clear_authentication();

-- -- Test 3: Check if the function updates the user_right correctly and returns 'OK' when given a valid invite
SELECT tests.authenticate_as('test_admin');
UPDATE org_users SET user_right = 'invite_admin' WHERE user_id = tests.get_supabase_uid('test_user');
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('test_user');
SELECT is(accept_invitation_to_org((SELECT id FROM orgs WHERE created_by = tests.get_supabase_uid('test_admin'))), 'OK', 'accept_invitation_to_org test - valid input');

SELECT is(
  (SELECT user_right FROM org_users WHERE user_id = tests.get_supabase_uid('test_user') AND org_id = (SELECT id FROM orgs WHERE created_by = tests.get_supabase_uid('test_admin'))),
  'admin'::user_min_right, 
  'accept_invitation_to_org test - user_right updated'
);
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
