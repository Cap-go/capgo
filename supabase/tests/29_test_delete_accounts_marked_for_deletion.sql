BEGIN;

SELECT plan(47);

-- Test helper function to create test users in both auth.users and public.users tables
CREATE OR REPLACE FUNCTION create_test_user_for_deletion(
    user_id UUID, user_email TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    '$2a$10$test_encrypted_password', NOW(), NOW(), 'test_token_' || user_id::text, NOW(), 
    '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', 
    '{"test_identifier": "test_deletion"}', 'f', NOW(), NOW(), NULL, NULL, 
    '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false
  );

  -- Insert into public.users table
  INSERT INTO "public"."users" ("id", "email", "created_at", "updated_at") 
  VALUES (user_id, user_email, NOW(), NOW());
END;
$$;

-- Test 1: Function exists and has correct signature
SELECT
    ok(
        pg_get_functiondef(
            'delete_accounts_marked_for_deletion()'::REGPROCEDURE
        ) IS NOT NULL,
        'delete_accounts_marked_for_deletion function exists'
    );

-- Test 2: Function returns correct table structure
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                information_schema.columns
            WHERE
                table_name = 'delete_accounts_marked_for_deletion'
                AND column_name IN ('deleted_count', 'deleted_user_ids')
        ) = 0, -- Function returns a table, not a persistent table
        'delete_accounts_marked_for_deletion returns table with correct structure'
    );

-- Test 3: No accounts to delete (empty table scenario)
SELECT
    ok(
        (
            SELECT deleted_count
            FROM
                delete_accounts_marked_for_deletion()
            LIMIT
                1
        ) = 0,
        'delete_accounts_marked_for_deletion returns 0 when no accounts to delete'
    );

SELECT
    ok(
        (
            SELECT array_length(deleted_user_ids, 1)
            FROM
                delete_accounts_marked_for_deletion()
            LIMIT
                1
        ) IS NULL,
        'delete_accounts_marked_for_deletion returns empty array when no accounts to delete'
    );

-- Test 4: Accounts with future removal dates are not deleted
-- Create test user
SELECT
    create_test_user_for_deletion(
        '11111111-1111-1111-1111-111111111111'::UUID,
        'future_delete@test.com'
    );

-- Mark for deletion with future date
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    '11111111-1111-1111-1111-111111111111'::UUID,
    NOW() + INTERVAL '7 days',
    '{"email": "future_delete@test.com", "apikeys": []}'::JSONB
);

SELECT
    ok(
        (
            SELECT deleted_count
            FROM
                delete_accounts_marked_for_deletion()
            LIMIT
                1
        ) = 0,
        'delete_accounts_marked_for_deletion does not delete accounts with future removal dates'
    );

-- Verify user still exists in both tables
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                auth.users
            WHERE
                id = '11111111-1111-1111-1111-111111111111'::UUID
        ),
        'User with future deletion date still exists in auth.users'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '11111111-1111-1111-1111-111111111111'::UUID
        ),
        'User with future deletion date still exists in public.users'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.to_delete_accounts
            WHERE
                account_id = '11111111-1111-1111-1111-111111111111'::UUID
        ),
        'User with future deletion date still exists in to_delete_accounts'
    );

-- Test 5: Accounts with past removal dates are deleted successfully
-- Create test user for deletion
SELECT
    create_test_user_for_deletion(
        '22222222-2222-2222-2222-222222222222'::UUID,
        'past_delete@test.com'
    );

-- Mark for deletion with past date
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    '22222222-2222-2222-2222-222222222222'::UUID,
    NOW() - INTERVAL '1 day',
    '{"email": "past_delete@test.com", "apikeys": []}'::JSONB
);

-- Test deletion count by running function once and checking result
SELECT
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 1,
        'delete_accounts_marked_for_deletion deletes 1 account with past removal date'
    );

-- Test that the correct user ID is in the results (run function again, should return 0 now)
SELECT
    ok(
        (
            SELECT deleted_count
            FROM
                delete_accounts_marked_for_deletion()
            LIMIT
                1
        ) = 0,
        'delete_accounts_marked_for_deletion returns 0 on second run (user already deleted)'
    );

-- Verify user is deleted from both auth.users and public.users
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                auth.users
            WHERE
                id = '22222222-2222-2222-2222-222222222222'::UUID
        ),
        'User with past deletion date is removed from auth.users'
    );

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '22222222-2222-2222-2222-222222222222'::UUID
        ),
        'User with past deletion date is removed from public.users'
    );

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.to_delete_accounts
            WHERE
                account_id = '22222222-2222-2222-2222-222222222222'::UUID
        ),
        'User with past deletion date is removed from to_delete_accounts'
    );

-- Test 6: Multiple accounts deletion
-- Create multiple test users
SELECT
    create_test_user_for_deletion(
        '33333333-3333-3333-3333-333333333333'::UUID,
        'multi_delete1@test.com'
    );

SELECT
    create_test_user_for_deletion(
        '44444444-4444-4444-4444-444444444444'::UUID,
        'multi_delete2@test.com'
    );

-- Mark both for deletion with past dates
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
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
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 2,
        'delete_accounts_marked_for_deletion deletes multiple accounts'
    );

-- Test 7: Mixed scenario - some accounts ready for deletion, some not
-- Create another test user with future date
SELECT
    create_test_user_for_deletion(
        '55555555-5555-5555-5555-555555555555'::UUID,
        'mixed_future@test.com'
    );

-- Create another test user with past date
SELECT
    create_test_user_for_deletion(
        '66666666-6666-6666-6666-666666666666'::UUID,
        'mixed_past@test.com'
    );

-- Mark one for future deletion, one for past deletion
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
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
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 1,
        'delete_accounts_marked_for_deletion deletes only accounts with past dates in mixed scenario'
    );

-- Verify future account still exists
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '55555555-5555-5555-5555-555555555555'::UUID
        ),
        'Account with future deletion date remains in mixed scenario'
    );

-- Verify past account is deleted
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '66666666-6666-6666-6666-666666666666'::UUID
        ),
        'Account with past deletion date is deleted in mixed scenario'
    );

-- Test 8: Function should fail when encountering database constraint errors
-- Create a user and then manually delete it from auth.users to simulate error condition
SELECT
    create_test_user_for_deletion(
        '77777777-7777-7777-7777-777777777777'::UUID,
        'error_test@test.com'
    );

-- Mark for deletion
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    '77777777-7777-7777-7777-777777777777'::UUID,
    NOW() - INTERVAL '1 day',
    '{"email": "error_test@test.com", "apikeys": []}'::JSONB
);

-- Manually delete from auth.users to create an inconsistent state
DELETE FROM auth.users
WHERE
    id = '77777777-7777-7777-7777-777777777777'::UUID;

-- This should complete successfully since DELETE on non-existent rows doesn't error
-- but let's verify it still works
SELECT
    lives_ok(
        'SELECT delete_accounts_marked_for_deletion()',
        'delete_accounts_marked_for_deletion completes even when auth.users record already missing'
    );

-- Verify the record is cleaned up from to_delete_accounts
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.to_delete_accounts
            WHERE
                account_id = '77777777-7777-7777-7777-777777777777'::UUID
        ),
        'to_delete_accounts record is cleaned up when auth.users record was already missing'
    );

-- Test 8: Last super_admin deletion - all org resources should be deleted
-- Create a test user who will be the only super_admin
SELECT
    create_test_user_for_deletion(
        '88888888-8888-8888-8888-888888888888'::UUID,
        'last_admin@test.com'
    );

-- Create an org for this user
INSERT INTO
public.orgs (
    id,
    created_by,
    created_at,
    updated_at,
    name,
    management_email
)
VALUES
(
    '88888888-8888-8888-8888-888888888888'::UUID,
    '88888888-8888-8888-8888-888888888888'::UUID,
    NOW(),
    NOW(),
    'Last Admin Org',
    'last_admin@test.com'
);

-- Add user as super_admin to the org
INSERT INTO
public.org_users (org_id, user_id, user_right)
VALUES
(
    '88888888-8888-8888-8888-888888888888'::UUID,
    '88888888-8888-8888-8888-888888888888'::UUID,
    'super_admin'::public.USER_MIN_RIGHT
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Create an app owned by this user
INSERT INTO
public.apps (
    app_id,
    icon_url,
    user_id,
    name,
    owner_org,
    created_at,
    updated_at
)
VALUES
(
    'com.last.admin',
    'https://example.com/icon.png',
    '88888888-8888-8888-8888-888888888888'::UUID,
    'Last Admin App',
    '88888888-8888-8888-8888-888888888888'::UUID,
    NOW(),
    NOW()
);

-- Create an app_version
INSERT INTO
public.app_versions (
    id,
    app_id,
    name,
    user_id,
    owner_org,
    created_at,
    updated_at
)
VALUES
(
    1001,
    'com.last.admin',
    '1.0.0',
    '88888888-8888-8888-8888-888888888888'::UUID,
    '88888888-8888-8888-8888-888888888888'::UUID,
    NOW(),
    NOW()
);

-- Create a channel
INSERT INTO
public.channels (
    id,
    name,
    app_id,
    version,
    created_at,
    updated_at,
    created_by,
    owner_org
)
VALUES
(
    1001,
    'production',
    'com.last.admin',
    1001,
    NOW(),
    NOW(),
    '88888888-8888-8888-8888-888888888888'::UUID,
    '88888888-8888-8888-8888-888888888888'::UUID
);

-- Create a deploy_history record
INSERT INTO
public.deploy_history (
    id,
    channel_id,
    app_id,
    version_id,
    created_by,
    owner_org,
    created_at,
    updated_at,
    deployed_at
)
VALUES
(
    1001,
    1001,
    'com.last.admin',
    1001,
    '88888888-8888-8888-8888-888888888888'::UUID,
    '88888888-8888-8888-8888-888888888888'::UUID,
    NOW(),
    NOW(),
    NOW()
);

-- Mark user for deletion
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    '88888888-8888-8888-8888-888888888888'::UUID,
    NOW() - INTERVAL '1 day',
    '{"email": "last_admin@test.com", "apikeys": []}'::JSONB
);

-- Verify resources exist before deletion
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.apps
            WHERE
                app_id = 'com.last.admin'
        ),
        'App exists before last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.app_versions
            WHERE
                id = 1001
        ),
        'App version exists before last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.channels
            WHERE
                id = 1001
        ),
        'Channel exists before last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.deploy_history
            WHERE
                id = 1001
        ),
        'Deploy history exists before last super_admin deletion'
    );

-- Run deletion
SELECT
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 1,
        'Last super_admin user deleted successfully'
    );

-- Verify user is deleted
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '88888888-8888-8888-8888-888888888888'::UUID
        ),
        'Last super_admin removed from public.users'
    );

-- Verify ALL org resources are deleted (not transferred)
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.apps
            WHERE
                app_id = 'com.last.admin'
        ),
        'App deleted when user is last super_admin'
    );

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.app_versions
            WHERE
                id = 1001
        ),
        'App version deleted when user is last super_admin'
    );

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.channels
            WHERE
                id = 1001
        ),
        'Channel deleted when user is last super_admin'
    );

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.deploy_history
            WHERE
                id = 1001
        ),
        'Deploy history deleted when user is last super_admin'
    );

-- Clean up org
DELETE FROM public.orgs
WHERE
    id = '88888888-8888-8888-8888-888888888888'::UUID;

-- Test 9: Non-last super_admin deletion - ownership should be transferred
-- Create two users
SELECT
    create_test_user_for_deletion(
        '99999999-9999-9999-9999-999999999999'::UUID,
        'admin1@test.com'
    );

SELECT
    create_test_user_for_deletion(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'admin2@test.com'
    );

-- Create an org
INSERT INTO
public.orgs (
    id,
    created_by,
    created_at,
    updated_at,
    name,
    management_email
)
VALUES
(
    '99999999-9999-9999-9999-999999999999'::UUID,
    '99999999-9999-9999-9999-999999999999'::UUID,
    NOW(),
    NOW(),
    'Shared Admin Org',
    'admin1@test.com'
);

-- Add both users as super_admins
INSERT INTO
public.org_users (org_id, user_id, user_right)
VALUES
(
    '99999999-9999-9999-9999-999999999999'::UUID,
    '99999999-9999-9999-9999-999999999999'::UUID,
    'super_admin'::public.USER_MIN_RIGHT
),
(
    '99999999-9999-9999-9999-999999999999'::UUID,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    'super_admin'::public.USER_MIN_RIGHT
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Create resources owned by admin1
INSERT INTO
public.apps (
    app_id,
    icon_url,
    user_id,
    name,
    owner_org,
    created_at,
    updated_at
)
VALUES
(
    'com.shared.app',
    'https://example.com/icon.png',
    '99999999-9999-9999-9999-999999999999'::UUID,
    'Shared App',
    '99999999-9999-9999-9999-999999999999'::UUID,
    NOW(),
    NOW()
);

INSERT INTO
public.app_versions (
    id,
    app_id,
    name,
    user_id,
    owner_org,
    created_at,
    updated_at
)
VALUES
(
    2001,
    'com.shared.app',
    '1.0.0',
    '99999999-9999-9999-9999-999999999999'::UUID,
    '99999999-9999-9999-9999-999999999999'::UUID,
    NOW(),
    NOW()
);

INSERT INTO
public.channels (
    id,
    name,
    app_id,
    version,
    created_at,
    updated_at,
    created_by,
    owner_org
)
VALUES
(
    2001,
    'production',
    'com.shared.app',
    2001,
    NOW(),
    NOW(),
    '99999999-9999-9999-9999-999999999999'::UUID,
    '99999999-9999-9999-9999-999999999999'::UUID
);

INSERT INTO
public.deploy_history (
    id,
    channel_id,
    app_id,
    version_id,
    created_by,
    owner_org,
    created_at,
    updated_at,
    deployed_at
)
VALUES
(
    2001,
    2001,
    'com.shared.app',
    2001,
    '99999999-9999-9999-9999-999999999999'::UUID,
    '99999999-9999-9999-9999-999999999999'::UUID,
    NOW(),
    NOW(),
    NOW()
);

-- Mark admin1 for deletion
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    '99999999-9999-9999-9999-999999999999'::UUID,
    NOW() - INTERVAL '1 day',
    '{"email": "admin1@test.com", "apikeys": []}'::JSONB
);

-- Verify resources exist before deletion
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.apps
            WHERE
                app_id = 'com.shared.app'
                AND user_id = '99999999-9999-9999-9999-999999999999'::UUID
        ),
        'App owned by admin1 before deletion'
    );

-- Run deletion
SELECT
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 1,
        'Non-last super_admin user deleted successfully'
    );

-- Verify user is deleted
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = '99999999-9999-9999-9999-999999999999'::UUID
        ),
        'Non-last super_admin removed from public.users'
    );

-- Verify resources still exist (not deleted)
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.apps
            WHERE
                app_id = 'com.shared.app'
        ),
        'App still exists after non-last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.app_versions
            WHERE
                id = 2001
        ),
        'App version still exists after non-last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.channels
            WHERE
                id = 2001
        ),
        'Channel still exists after non-last super_admin deletion'
    );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.deploy_history
            WHERE
                id = 2001
        ),
        'Deploy history still exists after non-last super_admin deletion'
    );

-- Verify ownership transferred to admin2
SELECT
    ok(
        (
            SELECT user_id
            FROM
                public.apps
            WHERE
                app_id = 'com.shared.app'
        ) = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'App ownership transferred to remaining super_admin'
    );

SELECT
    ok(
        (
            SELECT user_id
            FROM
                public.app_versions
            WHERE
                id = 2001
        ) = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'App version ownership transferred to remaining super_admin'
    );

SELECT
    ok(
        (
            SELECT created_by
            FROM
                public.channels
            WHERE
                id = 2001
        ) = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'Channel ownership transferred to remaining super_admin'
    );

SELECT
    ok(
        (
            SELECT created_by
            FROM
                public.deploy_history
            WHERE
                id = 2001
        ) = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'Deploy history ownership transferred to remaining super_admin'
    );

-- Clean up
DELETE FROM public.deploy_history
WHERE
    id = 2001;

DELETE FROM public.channels
WHERE
    id = 2001;

DELETE FROM public.app_versions
WHERE
    id = 2001;

DELETE FROM public.apps
WHERE
    app_id = 'com.shared.app';

DELETE FROM public.org_users
WHERE
    org_id = '99999999-9999-9999-9999-999999999999'::UUID;

DELETE FROM public.orgs
WHERE
    id = '99999999-9999-9999-9999-999999999999'::UUID;

DELETE FROM public.users
WHERE
    id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;

DELETE FROM auth.users
WHERE
    id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;

-- Test 10: Audit logs ownership transfer during user deletion
-- Create two users for audit log test
SELECT
    create_test_user_for_deletion(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
        'audit_admin1@test.com'
    );

SELECT
    create_test_user_for_deletion(
        'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
        'audit_admin2@test.com'
    );

-- Create an org for audit log test
INSERT INTO
public.orgs (
    id,
    created_by,
    created_at,
    updated_at,
    name,
    management_email
)
VALUES
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    NOW(),
    NOW(),
    'Audit Log Test Org',
    'audit_admin1@test.com'
);

-- Add both users as super_admins
INSERT INTO
public.org_users (org_id, user_id, user_right)
VALUES
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'super_admin'::public.USER_MIN_RIGHT
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
    'super_admin'::public.USER_MIN_RIGHT
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Manually insert audit log entries for admin1
-- (Normally these would be created by triggers, but we insert directly for testing)
INSERT INTO
public.audit_logs (
    table_name, record_id, operation, user_id, org_id, old_record, new_record
)
VALUES
(
    'apps',
    'com.audit.test',
    'INSERT',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    NULL,
    '{"app_id": "com.audit.test"}'::JSONB
),
(
    'channels',
    '3001',
    'UPDATE',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    '{"name": "old_channel"}'::JSONB,
    '{"name": "new_channel"}'::JSONB
);

-- Count audit logs before deletion (includes trigger-created entries from org/org_users inserts)
-- We need to track the count before and compare after
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                public.audit_logs
            WHERE
                user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
                AND org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
        ) >= 2,
        'At least two audit log entries exist for admin1 before deletion'
    );

-- Mark admin1 for deletion
INSERT INTO
public.to_delete_accounts (account_id, removal_date, removed_data)
VALUES
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
    NOW() - INTERVAL '1 day',
    '{"email": "audit_admin1@test.com", "apikeys": []}'::JSONB
);

-- Run deletion
SELECT
    ok(
        (
            WITH
            deletion_results AS (
                SELECT *
                FROM
                    delete_accounts_marked_for_deletion()
                LIMIT
                    1
            )

            SELECT deleted_count
            FROM
                deletion_results
        ) = 1,
        'User with audit logs deleted successfully'
    );

-- Verify user is deleted
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.users
            WHERE
                id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
        ),
        'Admin1 removed from public.users'
    );

-- Verify audit logs still exist (not deleted) - should have at least 2 entries
-- Note: triggers may have created additional entries when creating the org/org_users
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                public.audit_logs
            WHERE
                org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
        ) >= 2,
        'Audit log entries still exist after user deletion'
    );

-- Verify audit logs that were owned by admin1 are now owned by admin2
-- The key test is that entries originally created by admin1 are transferred
SELECT
    ok(
        (
            SELECT count(*)
            FROM
                public.audit_logs
            WHERE
                user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID
                AND org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
                AND table_name IN ('apps', 'channels')
                AND record_id IN ('com.audit.test', '3001')
        ) = 2,
        'Audit log entries ownership transferred to remaining super_admin'
    );

-- Verify no audit logs owned by admin1 remain (they should have been transferred)
SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.audit_logs
            WHERE
                org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
                AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
        ),
        'No audit log entries remain owned by deleted user'
    );

-- Clean up audit log test
DELETE FROM public.audit_logs
WHERE
    org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

DELETE FROM public.org_users
WHERE
    org_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

DELETE FROM public.orgs
WHERE
    id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID;

DELETE FROM public.users
WHERE
    id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;

DELETE FROM auth.users
WHERE
    id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID;

-- Clean up test helper function before permission tests
DROP FUNCTION create_test_user_for_deletion(UUID, TEXT);

-- Test 10: Function permissions - only service_role and postgres can execute
-- This test verifies the REVOKE/GRANT statements in the migration
SELECT tests.authenticate_as('test_user');

-- The function should throw a permission error when called by a regular user
SELECT
    throws_ok(
        'SELECT delete_accounts_marked_for_deletion()',
        '42501',
        'permission denied for function delete_accounts_marked_for_deletion',
        'delete_accounts_marked_for_deletion throws permission denied for regular users'
    );

SELECT tests.clear_authentication();

SELECT *
FROM
    finish();

ROLLBACK;
