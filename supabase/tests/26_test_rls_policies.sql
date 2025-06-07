-- Test RLS Policies
-- This file tests all Row Level Security policies in the database
BEGIN;

-- Plan the number of tests
SELECT
  plan (35);

-- Test app_versions policies
SELECT
  policies_are (
    'public',
    'app_versions',
    ARRAY[
      'Allow all for auth (super_admin+)',
      'Allow for auth, api keys (read+)',
      'Allow insert for api keys (write,all,upload) (upload+)',
      'Allow update for auth (write+)',
      'Allow update for api keys (write,all,upload) (upload+)',
      'Prevent non 2FA access'
    ],
    'app_versions should have correct policies'
  );

-- Test apps policies
SELECT
  policies_are (
    'public',
    'apps',
    ARRAY[
      'Allow all for auth (super_admin+)',
      'Allow for auth, api keys (read+)',
      'Allow insert for apikey (write,all) (admin+)',
      'Allow update for auth, api keys (write, all) (admin+)',
      'Prevent non 2FA access'
    ],
    'apps should have correct policies'
  );

-- Test global_stats policies
SELECT
  policies_are (
    'public',
    'global_stats',
    ARRAY['Allow anon to select'],
    'global_stats should have correct policies'
  );

-- Test stats policies
SELECT
  policies_are (
    'public',
    'stats',
    ARRAY[
      'Allow apikey to read',
      'Allow read for auth (read+)'
    ],
    'stats should have correct policies'
  );

-- Test channel_devices policies
SELECT
  policies_are (
    'public',
    'channel_devices',
    ARRAY[
      'Allow delete for auth (write+)',
      'Allow insert for auth (write+)',
      'Allow read for auth (read+)',
      'Allow update for auth, api keys (write+)',
      'Prevent non 2FA access'
    ],
    'channel_devices should have correct policies'
  );

-- Test orgs policies
SELECT
  policies_are (
    'public',
    'orgs',
    ARRAY[
      'Allow org delete for super_admin',
      'Allow select for auth, api keys (read+)',
      'Allow update for auth (admin+)',
      'Allow webapp to insert',
      'Prevent non 2FA access'
    ],
    'orgs should have correct policies'
  );

-- Test devices policies
SELECT
  policies_are (
    'public',
    'devices',
    ARRAY['Allow owner to update', 'Allow devices select'],
    'devices should have correct policies'
  );

-- Test app_versions_meta policies
SELECT
  policies_are (
    'public',
    'app_versions_meta',
    ARRAY['Allow read for auth (read+)'],
    'app_versions_meta should have correct policies'
  );

-- Test daily_bandwidth policies
SELECT
  policies_are (
    'public',
    'daily_bandwidth',
    ARRAY['Allow read for auth (read+)'],
    'daily_bandwidth should have correct policies'
  );

-- Test daily_mau policies
SELECT
  policies_are (
    'public',
    'daily_mau',
    ARRAY['Allow read for auth (read+)'],
    'daily_mau should have correct policies'
  );

-- Test daily_storage policies
SELECT
  policies_are (
    'public',
    'daily_storage',
    ARRAY['Allow read for auth (read+)'],
    'daily_storage should have correct policies'
  );

-- Test daily_version policies
SELECT
  policies_are (
    'public',
    'daily_version',
    ARRAY['Allow read for auth (read+)'],
    'daily_version should have correct policies'
  );

-- Test users policies
SELECT
  policies_are (
    'public',
    'users',
    ARRAY['Allow self to modify self'],
    'users should have correct policies'
  );

-- Test org_users policies
SELECT
  policies_are (
    'public',
    'org_users',
    ARRAY[
      'Allow memeber and owner to select',
      'Allow org admin to update',
      'Allow to self delete',
      'Allow org admin to insert',
      'Prevent non 2FA access'
    ],
    'org_users should have correct policies'
  );

-- Test channels policies
SELECT
  policies_are (
    'public',
    'channels',
    ARRAY[
      'Allow delete for auth (admin+) (all apikey)',
      'Allow insert for auth, api keys (write, all) (admin+)',
      'Allow select for auth, api keys (read+)',
      'Allow update for auth, api keys (write, all) (write+)',
      'Prevent non 2FA access'
    ],
    'channels should have correct policies'
  );

-- Test stripe_info policies
SELECT
  policies_are (
    'public',
    'stripe_info',
    ARRAY['Allow user to self get'],
    'stripe_info should have correct policies'
  );

-- Test manifest policies
SELECT
  policies_are (
    'public',
    'manifest',
    ARRAY[
      'Allow users to delete manifest entries',
      'Allow users to insert manifest entries',
      'Allow users to read any manifest entry',
      'Prevent users from updating manifest entries'
    ],
    'manifest should have correct policies'
  );

-- Test deploy_history policies
SELECT
  policies_are (
    'public',
    'deploy_history',
    ARRAY[
      'Allow users to view deploy history for their org',
      'Allow users with write permissions to insert deploy history',
      'Deny delete on deploy history',
      'Prevent update on deploy history'
    ],
    'deploy_history should have correct policies'
  );

-- Test bandwidth_usage policies
SELECT
  policies_are (
    'public',
    'bandwidth_usage',
    ARRAY['Disable for all'],
    'bandwidth_usage should have correct policies'
  );

-- Test device_usage policies
SELECT
  policies_are (
    'public',
    'device_usage',
    ARRAY['Disable for all'],
    'device_usage should have correct policies'
  );

-- Test notifications policies
SELECT
  policies_are (
    'public',
    'notifications',
    ARRAY['Disable for all'],
    'notifications should have correct policies'
  );

-- Test storage_usage policies
SELECT
  policies_are (
    'public',
    'storage_usage',
    ARRAY['Disable for all'],
    'storage_usage should have correct policies'
  );

-- Test version_meta policies
SELECT
  policies_are (
    'public',
    'version_meta',
    ARRAY['Disable for all'],
    'version_meta should have correct policies'
  );

-- Test version_usage policies
SELECT
  policies_are (
    'public',
    'version_usage',
    ARRAY['Disable for all'],
    'version_usage should have correct policies'
  );

-- Test apikeys policies
SELECT
  policies_are (
    'public',
    'apikeys',
    ARRAY[
      'Enable all for user based on user_id',
      'Prevent non 2FA access'
    ],
    'apikeys should have correct policies'
  );

-- Test plans policies
SELECT
  policies_are (
    'public',
    'plans',
    ARRAY['Enable select for anyone'],
    'plans should have correct policies'
  );

-- Test deleted_account policies
SELECT
  policies_are (
    'public',
    'deleted_account',
    ARRAY['Enable update for users based on email'],
    'deleted_account should have correct policies'
  );

-- Test deleted_apps policies
SELECT
  policies_are (
    'public',
    'deleted_apps',
    ARRAY['deny_all_access'],
    'deleted_apps should have correct policies'
  );

-- Test storage.objects policies
SELECT
  policies_are (
    'storage',
    'objects',
    ARRAY[
      'All all users to act',
      'All user to manage they own folder 1ffg0oo_0',
      'All user to manage they own folder 1ffg0oo_1',
      'All user to manage they own folder 1ffg0oo_2',
      'All user to manage they own folder 1ffg0oo_3',
      'Allow apikey to manage they folder',
      'Allow apikey to manage they folder 21'
    ],
    'storage.objects should have correct policies'
  );

-- Test storage.buckets policies
SELECT
  policies_are (
    'storage',
    'buckets',
    ARRAY['Disable act bucket for users'],
    'storage.buckets should have correct policies'
  );

-- Additional tests for policy roles and commands
-- Test that restrictive policies are marked as restrictive
SELECT
  is (
    (
      SELECT
        COUNT(*)
      FROM
        pg_policies
      WHERE
        schemaname = 'public'
        AND tablename = 'apikeys'
        AND policyname = 'Prevent non 2FA access'
        AND permissive = 'RESTRICTIVE'
    ),
    1::bigint,
    'Prevent non 2FA access policy on apikeys should be restrictive'
  );

-- Test policy commands for specific policies
SELECT
  policy_cmd_is (
    'public',
    'app_versions',
    'Allow all for auth (super_admin+)',
    'DELETE',
    'Delete policy on app_versions should be for DELETE command'
  );

SELECT
  policy_cmd_is (
    'public',
    'apps',
    'Allow for auth, api keys (read+)',
    'SELECT',
    'Read policy on apps should be for SELECT command'
  );

SELECT
  policy_cmd_is (
    'public',
    'channel_devices',
    'Allow insert for auth (write+)',
    'INSERT',
    'Insert policy on channel_devices should be for INSERT command'
  );

SELECT
  policy_cmd_is (
    'public',
    'orgs',
    'Allow update for auth (admin+)',
    'UPDATE',
    'Update policy on orgs should be for UPDATE command'
  );

-- Complete the tests
SELECT
  *
FROM
  finish ();

ROLLBACK;
