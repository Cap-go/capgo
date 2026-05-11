BEGIN;

SELECT plan(6);

SELECT
  ok(
    (
      SELECT qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND policyname = 'Allow read for auth (read+)'
    ) LIKE '%rbac_check_permission_request%rbac_perm_channel_read_forced_devices%channel_id%',
    'channel_devices SELECT policy uses channel.read_forced_devices with channel scope'
  );

SELECT
  ok(
    (
      SELECT qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND policyname = 'Allow delete for auth, api keys (write+)'
    ) LIKE '%rbac_check_permission_request%rbac_perm_channel_manage_forced_devices%channel_id%',
    'channel_devices DELETE policy uses channel.manage_forced_devices with channel scope'
  );

SELECT
  ok(
    (
      SELECT with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND policyname = 'Allow insert for auth (write+)'
    ) LIKE '%rbac_check_permission_request%rbac_perm_channel_manage_forced_devices%channel_id%',
    'channel_devices INSERT policy uses channel.manage_forced_devices with channel scope'
  );

SELECT
  ok(
    (
      SELECT qual
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND policyname = 'Allow update for auth, api keys (write+)'
    ) LIKE '%rbac_check_permission_request%rbac_perm_channel_manage_forced_devices%channel_id%',
    'channel_devices UPDATE USING policy uses channel.manage_forced_devices with channel scope'
  );

SELECT
  ok(
    (
      SELECT with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND policyname = 'Allow update for auth, api keys (write+)'
    ) LIKE '%rbac_check_permission_request%rbac_perm_channel_manage_forced_devices%channel_id%',
    'channel_devices UPDATE WITH CHECK policy uses channel.manage_forced_devices with channel scope'
  );

SELECT
  ok(
    NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_devices'
        AND (
          COALESCE(qual, '') LIKE '%check_min_rights%'
          OR COALESCE(with_check, '') LIKE '%check_min_rights%'
        )
    ),
    'channel_devices policies do not retain legacy check_min_rights grants'
  );

SELECT *
FROM finish();

ROLLBACK;
