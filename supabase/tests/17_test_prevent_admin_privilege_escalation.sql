BEGIN;


SELECT plan(4);

CREATE OR REPLACE FUNCTION my_tests() RETURNS SETOF TEXT AS $$
DECLARE
  rls_failed BOOLEAN := false;
  rows_updated INTEGER := 0;
BEGIN

truncate table org_users;
PERFORM tests.create_supabase_user('test_member', 'member@test.com', '555-555-5555');

INSERT INTO users (id, first_name, last_name, email)
VALUES ((tests.get_supabase_uid('test_member')), 'admin', 'admin', 'member@test.com');

INSERT INTO org_users (user_id, org_id, user_right)
VALUES ((tests.get_supabase_uid('test_member')), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'admin'::"public"."user_min_right");

PERFORM tests.authenticate_as('test_member');

-- Switch to authenticated role to properly test RLS
-- RLS should prevent authenticated users from updating org_users directly
SET LOCAL ROLE authenticated;

-- Test 1: Verify that RLS prevents direct update to super_admin
-- The UPDATE should not match any rows because RLS blocks SELECT
UPDATE org_users SET user_right = 'super_admin'::"public"."user_min_right" WHERE user_id = (select tests.get_supabase_uid('test_member'));
GET DIAGNOSTICS rows_updated = ROW_COUNT;

-- If no rows were updated, RLS blocked the update (which is the desired behavior)
RETURN NEXT IS(rows_updated, 0, 'Expect admin -> super_admin to fail (RLS blocks update)');

-- Test 2: Verify that RLS prevents direct update to invite_super_admin
UPDATE org_users SET user_right = 'invite_super_admin'::"public"."user_min_right" WHERE user_id = (select tests.get_supabase_uid('test_member'));
GET DIAGNOSTICS rows_updated = ROW_COUNT;

RETURN NEXT IS(rows_updated, 0, 'Expect admin -> invite_super_admin to fail (RLS blocks update)');

-- Reset role back to postgres for remaining tests
RESET ROLE;

-- Test 3-4: Verify that invite_user_to_org function also rejects super_admin invites
RETURN NEXT IS((select invite_user_to_org('test@capgo.app', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'super_admin'::"public"."user_min_right")), 'NO_RIGHTS', 'Invite as super admin should fail for admin role');
RETURN NEXT IS((select invite_user_to_org('test@capgo.app', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'invite_super_admin'::"public"."user_min_right")), 'NO_RIGHTS', 'invite as invited_super_admin should fail for admin role');

END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT *
FROM
    finish();

ROLLBACK;
