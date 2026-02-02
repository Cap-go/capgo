-- Test for email_preferences JSONB column on users table
-- Migration: 20251228065406_user_email_preferences.sql

BEGIN;

SELECT plan(15);

-- Create test user for email preferences tests
DO $$
BEGIN
  PERFORM tests.create_supabase_user('email_pref_user', 'email-pref@example.com', '555-001-0001');
END;
$$ LANGUAGE plpgsql;

-- Create test context table
CREATE TEMP TABLE email_pref_context (
    user_id uuid,
    org_id uuid
) ON COMMIT DROP;

-- Insert test user into users table
WITH user_insert AS (
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (
        tests.get_supabase_uid('email_pref_user'),
        'email-pref@example.com',
        now(),
        now()
    )
    RETURNING id
)

INSERT INTO email_pref_context (user_id, org_id)
SELECT
    user_insert.id,
    gen_random_uuid()
FROM user_insert;

-- Test 1: Verify email_preferences column exists
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE
                table_schema = 'public'
                AND table_name = 'users'
                AND column_name = 'email_preferences'
        ),
        'email_preferences column exists on users table'
    );

-- Test 2: Verify email_preferences column is JSONB type
SELECT
    is(
        (
            SELECT data_type
            FROM information_schema.columns
            WHERE
                table_schema = 'public'
                AND table_name = 'users'
                AND column_name = 'email_preferences'
        ),
        'jsonb',
        'email_preferences column is JSONB type'
    );

-- Test 3: Verify default value contains all expected keys
SELECT
    ok(
        (
            SELECT
                email_preferences ? 'usage_limit'
                AND email_preferences ? 'credit_usage'
                AND email_preferences ? 'onboarding'
                AND email_preferences ? 'weekly_stats'
                AND email_preferences ? 'monthly_stats'
                AND email_preferences ? 'deploy_stats_24h'
                AND email_preferences ? 'bundle_created'
                AND email_preferences ? 'bundle_deployed'
                AND email_preferences ? 'device_error'
                AND email_preferences ? 'cli_realtime_feed'
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'email_preferences default contains all 10 preference keys'
    );

-- Test 4: Verify all default values are true
SELECT
    ok(
        (
            SELECT
                (email_preferences ->> 'usage_limit')::boolean = true
                AND (email_preferences ->> 'credit_usage')::boolean = true
                AND (email_preferences ->> 'onboarding')::boolean = true
                AND (email_preferences ->> 'weekly_stats')::boolean = true
                AND (email_preferences ->> 'monthly_stats')::boolean = true
                AND (email_preferences ->> 'deploy_stats_24h')::boolean = true
                AND (email_preferences ->> 'bundle_created')::boolean = true
                AND (email_preferences ->> 'bundle_deployed')::boolean = true
                AND (email_preferences ->> 'device_error')::boolean = true
                AND (email_preferences ->> 'cli_realtime_feed')::boolean = true
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'all email_preferences default to true'
    );

-- Test 5: Can update individual preference to false
UPDATE public.users
SET email_preferences = email_preferences || '{"weekly_stats": false}'::jsonb
WHERE id = (SELECT user_id FROM email_pref_context);

SELECT
    is(
        (
            SELECT (email_preferences ->> 'weekly_stats')::boolean
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        false,
        'can update individual preference to false'
    );

-- Test 6: Other preferences remain unchanged after single update
SELECT
    ok(
        (
            SELECT
                (email_preferences ->> 'usage_limit')::boolean = true
                AND (email_preferences ->> 'credit_usage')::boolean = true
                AND (email_preferences ->> 'onboarding')::boolean = true
                AND (email_preferences ->> 'monthly_stats')::boolean = true
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'other preferences remain true after updating one'
    );

-- Test 7: Can update multiple preferences at once
UPDATE public.users
SET
    email_preferences
    = email_preferences
    || '{"device_error": false, "bundle_created": false}'::jsonb
WHERE id = (SELECT user_id FROM email_pref_context);

SELECT
    ok(
        (
            SELECT
                (email_preferences ->> 'device_error')::boolean = false
                AND (email_preferences ->> 'bundle_created')::boolean = false
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'can update multiple preferences at once'
    );

-- Test 8: Can toggle preference back to true
UPDATE public.users
SET email_preferences = email_preferences || '{"weekly_stats": true}'::jsonb
WHERE id = (SELECT user_id FROM email_pref_context);

SELECT
    is(
        (
            SELECT (email_preferences ->> 'weekly_stats')::boolean
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        true,
        'can toggle preference back to true'
    );

-- Test 9: Verify GIN index exists for performance
SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE
                schemaname = 'public'
                AND tablename = 'users'
                AND indexname = 'idx_users_email_preferences'
        ),
        'GIN index idx_users_email_preferences exists'
    );

-- Test 10: Can query users by specific preference value
SELECT
    ok(
        (
            SELECT count(*) > 0
            FROM public.users
            WHERE email_preferences @> '{"device_error": false}'::jsonb
        ),
        'can query users by email preference value using containment'
    );

-- Test 11: Invalid JSON update is rejected (integrity test)
DO $$
BEGIN
  BEGIN
    UPDATE public.users
    SET email_preferences = 'not valid json'::jsonb
    WHERE id = (SELECT user_id FROM email_pref_context);
    RAISE EXCEPTION 'Should have failed with invalid JSON';
  EXCEPTION
    WHEN invalid_text_representation THEN
      NULL; -- Expected error
  END;
END;
$$ LANGUAGE plpgsql;

SELECT ok(true, 'invalid JSON is rejected for email_preferences');

-- Test 12: Verify email_preferences column has NOT NULL constraint
SELECT
    is(
        (
            SELECT is_nullable
            FROM information_schema.columns
            WHERE
                table_schema = 'public'
                AND table_name = 'users'
                AND column_name = 'email_preferences'
        ),
        'NO',
        'email_preferences column has NOT NULL constraint'
    );

-- Test 13: New user gets default preferences
DO $$
BEGIN
  PERFORM tests.create_supabase_user('new_email_pref_user', 'new-email-pref-user@example.com', '555-001-0002');
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES (
    tests.get_supabase_uid('new_email_pref_user'),
    'new-email-pref-user@example.com',
    now(),
    now()
);

SELECT
    ok(
        (
            SELECT
                email_preferences IS NOT null
                AND (email_preferences ->> 'usage_limit')::boolean = true
            FROM public.users
            WHERE email = 'new-email-pref-user@example.com'
        ),
        'new user automatically gets default email preferences'
    );

-- Test 14: Complete preferences replacement works
UPDATE public.users
SET email_preferences = '{
  "usage_limit": false,
  "credit_usage": false,
  "onboarding": false,
  "weekly_stats": false,
  "monthly_stats": false,
  "deploy_stats_24h": false,
  "bundle_created": false,
  "bundle_deployed": false,
  "device_error": false
}'::jsonb
WHERE id = (SELECT user_id FROM email_pref_context);

SELECT
    ok(
        (
            SELECT
                (email_preferences ->> 'usage_limit')::boolean = false
                AND (email_preferences ->> 'credit_usage')::boolean = false
                AND (email_preferences ->> 'onboarding')::boolean = false
                AND (email_preferences ->> 'weekly_stats')::boolean = false
                AND (email_preferences ->> 'monthly_stats')::boolean = false
                AND (email_preferences ->> 'deploy_stats_24h')::boolean = false
                AND (email_preferences ->> 'bundle_created')::boolean = false
                AND (email_preferences ->> 'bundle_deployed')::boolean = false
                AND (email_preferences ->> 'device_error')::boolean = false
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'can replace all preferences at once'
    );

-- Test 15: Preferences with extra keys are accepted (forward compatibility)
UPDATE public.users
SET
    email_preferences
    = email_preferences || '{"future_preference": true}'::jsonb
WHERE id = (SELECT user_id FROM email_pref_context);

SELECT
    ok(
        (
            SELECT email_preferences ? 'future_preference'
            FROM public.users
            WHERE id = (SELECT user_id FROM email_pref_context)
        ),
        'extra preference keys are accepted for forward compatibility'
    );

SELECT * FROM finish();

ROLLBACK;
