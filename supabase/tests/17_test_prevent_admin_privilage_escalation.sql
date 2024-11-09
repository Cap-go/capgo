BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT plan(4);

CREATE OR REPLACE FUNCTION my_tests(
) RETURNS SETOF TEXT AS $$
DECLARE
  rls_failed BOOLEAN := false;
BEGIN

truncate table org_users;
PERFORM tests.create_supabase_user('test_member', 'member@test.com', '555-555-5555');

INSERT INTO users (id, first_name, last_name, email)
VALUES ((tests.get_supabase_uid('test_member')), 'admin', 'admin', 'member@test.com');

INSERT INTO org_users (user_id, org_id, user_right)
VALUES ((tests.get_supabase_uid('test_member')), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'admin'::"public"."user_min_right");

PERFORM tests.authenticate_as('test_member');

BEGIN
  -- Attempt to update the user_right
  UPDATE org_users SET user_right = 'super_admin'::"public"."user_min_right" WHERE user_id = (select tests.get_supabase_uid('test_member'));
  
  -- If successful, no further action is taken

  EXCEPTION
    WHEN OTHERS THEN
      -- Mark the test as passed if an exception is caught as expected
      rls_failed := TRUE;
      RAISE NOTICE 'Expected exception caught successfully';
END;

RETURN NEXT IS(rls_failed, true, 'Expect admin -> super_admin to fail');

rls_failed := false;

BEGIN
  -- Attempt to update the user_right
  UPDATE org_users SET user_right = 'invite_super_admin'::"public"."user_min_right" WHERE user_id = (select tests.get_supabase_uid('test_member'));
  
  -- If successful, no further action is taken

  EXCEPTION
    WHEN OTHERS THEN
      -- Mark the test as passed if an exception is caught as expected
      rls_failed := TRUE;
      RAISE NOTICE 'Expected exception caught successfully';
END;

RETURN NEXT IS(rls_failed, true, 'Expect admin -> invite_super_admin to fail');

RETURN NEXT IS((select invite_user_to_org('test@capgo.app', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'super_admin'::"public"."user_min_right")), 'NO_RIGHTS', 'Invite as super admin should fail for admin role');
RETURN NEXT IS((select invite_user_to_org('test@capgo.app', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'invite_super_admin'::"public"."user_min_right")), 'NO_RIGHTS', 'invite as invited_super_admin should fail for admin role');

END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;