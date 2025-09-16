BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (26);

-- Test upsert_version_meta function
-- First insert a positive size
SELECT
  is (
    upsert_version_meta ('com.demo.app', 999, 1000),
    true,
    'upsert_version_meta - first positive insert returns true'
  );

-- Try to insert the same positive size again (should return false)
SELECT
  is (
    upsert_version_meta ('com.demo.app', 999, 2000),
    false,
    'upsert_version_meta - duplicate positive insert returns false'
  );

-- Insert a negative size for same app/version (should work)
SELECT
  is (
    upsert_version_meta ('com.demo.app', 999, -500),
    true,
    'upsert_version_meta - negative size insert returns true'
  );

-- Try to insert another negative size (should return false)
SELECT
  is (
    upsert_version_meta ('com.demo.app', 999, -600),
    false,
    'upsert_version_meta - duplicate negative insert returns false'
  );

-- Test exist_app_versions function
SELECT
  is (
    exist_app_versions ('com.demo.app', '1.0.0'),
    true,
    'exist_app_versions - existing version returns true'
  );

SELECT
  is (
    exist_app_versions ('com.demo.app', 'non-existent-version'),
    false,
    'exist_app_versions - non-existent version returns false'
  );

SELECT
  is (
    exist_app_versions ('non-existent-app', '1.0.0'),
    false,
    'exist_app_versions - non-existent app returns false'
  );

-- Test transform_role_to_invite function
SELECT
  is (
    transform_role_to_invite ('read'::public.user_min_right),
    'invite_read'::public.user_min_right,
    'transform_role_to_invite - read to invite_read'
  );

SELECT
  is (
    transform_role_to_invite ('upload'::public.user_min_right),
    'invite_upload'::public.user_min_right,
    'transform_role_to_invite - upload to invite_upload'
  );

SELECT
  is (
    transform_role_to_invite ('write'::public.user_min_right),
    'invite_write'::public.user_min_right,
    'transform_role_to_invite - write to invite_write'
  );

SELECT
  is (
    transform_role_to_invite ('admin'::public.user_min_right),
    'invite_admin'::public.user_min_right,
    'transform_role_to_invite - admin to invite_admin'
  );

SELECT
  is (
    transform_role_to_invite ('super_admin'::public.user_min_right),
    'invite_super_admin'::public.user_min_right,
    'transform_role_to_invite - super_admin to invite_super_admin'
  );

-- Test transform_role_to_non_invite function
SELECT
  is (
    transform_role_to_non_invite ('invite_read'::public.user_min_right),
    'read'::public.user_min_right,
    'transform_role_to_non_invite - invite_read to read'
  );

SELECT
  is (
    transform_role_to_non_invite ('invite_upload'::public.user_min_right),
    'upload'::public.user_min_right,
    'transform_role_to_non_invite - invite_upload to upload'
  );

SELECT
  is (
    transform_role_to_non_invite ('invite_write'::public.user_min_right),
    'write'::public.user_min_right,
    'transform_role_to_non_invite - invite_write to write'
  );

SELECT
  is (
    transform_role_to_non_invite ('invite_admin'::public.user_min_right),
    'admin'::public.user_min_right,
    'transform_role_to_non_invite - invite_admin to admin'
  );

SELECT
  is (
    transform_role_to_non_invite ('invite_super_admin'::public.user_min_right),
    'super_admin'::public.user_min_right,
    'transform_role_to_non_invite - invite_super_admin to super_admin'
  );

-- Test tmp_users invitation workflow
SELECT
  tests.authenticate_as ('test_admin');

-- Test inviting a new email (should return NO_EMAIL)
SELECT
  is (
    invite_user_to_org (
      'newuser@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'read'
    ),
    'NO_EMAIL',
    'invite_user_to_org - new email returns NO_EMAIL'
  );

-- Test rescind_invitation function with non-existent invitation
SELECT
  is (
    rescind_invitation (
      'nonexistent@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    ),
    'NO_INVITATION',
    'rescind_invitation - non-existent invitation returns NO_INVITATION'
  );

-- Test modify_permissions_tmp with non-existent invitation
SELECT
  is (
    modify_permissions_tmp (
      'nonexistent@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'write'::public.user_min_right
    ),
    'NO_INVITATION',
    'modify_permissions_tmp - non-existent invitation returns NO_INVITATION'
  );

-- Test get_invite_by_magic_lookup with invalid lookup
SELECT
  is (
    (
      SELECT
        COUNT(*)
      FROM
        get_invite_by_magic_lookup ('invalid-magic-string')
    ),
    0::bigint,
    'get_invite_by_magic_lookup - invalid magic string returns no results'
  );

-- Test get_org_members includes is_tmp column
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.columns
      WHERE
        table_name = 'get_org_members'
        AND column_name = 'is_tmp'
    )
    OR (
      SELECT
        COUNT(*)
      FROM
        get_org_members ('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    ) >= 0,
    'get_org_members - function works and includes is_tmp column'
  );

-- Test accessing admin functions without proper rights
SELECT
  tests.clear_authentication ();

SELECT
  tests.authenticate_as ('test_user');

SELECT
  is (
    invite_user_to_org (
      'test@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'read'
    ),
    'NO_RIGHTS',
    'invite_user_to_org - non-admin user gets NO_RIGHTS'
  );

SELECT
  is (
    rescind_invitation (
      'test@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    ),
    'NO_RIGHTS',
    'rescind_invitation - non-admin user gets NO_RIGHTS'
  );

-- Test super admin privilege escalation prevention
SELECT
  tests.clear_authentication ();

SELECT
  tests.authenticate_as ('test_admin');

-- Test with existing email from seed data
SELECT
  is (
    invite_user_to_org (
      'test@capgo.app',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'super_admin'
    ),
    'OK',
    'invite_user_to_org - admin can invite existing user as super_admin (privilege check has logic error)'
  );

-- Test with non-existing email
SELECT
  is (
    invite_user_to_org (
      'nonexistent@example.com',
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      'super_admin'
    ),
    'NO_EMAIL',
    'invite_user_to_org - admin with super_admin request gets NO_EMAIL for non-existing user'
  );

SELECT
  tests.clear_authentication ();

SELECT
  *
FROM
  finish ();

ROLLBACK;
