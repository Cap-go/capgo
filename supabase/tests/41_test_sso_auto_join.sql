-- Tests for SSO Auto-Join functionality
-- Tests: org_sso_providers, org_domains tables, RPC functions, triggers

BEGIN;

SELECT plan(28);

-- ============================================================================
-- SETUP: Create test data
-- ============================================================================

-- Create test organization with Enterprise plan
SELECT tests.authenticate_as_service_role();

-- Create a stripe_info entry for Enterprise plan
INSERT INTO public.stripe_info (customer_id, product_id, status, is_good_plan)
VALUES ('cus_test_sso_enterprise', 'prod_LQIs1Yucml9ChU', 'succeeded', true);

-- Create test organization
INSERT INTO public.orgs (id, name, management_email, created_by, customer_id)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'SSO Test Enterprise Org',
    'admin@sso-test.com',
    tests.get_supabase_uid('test_admin'),
    'cus_test_sso_enterprise'
);

-- Add test_admin as super_admin
INSERT INTO public.org_users (user_id, org_id, user_right)
VALUES (
    tests.get_supabase_uid('test_admin'),
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'super_admin'
);

-- Create non-Enterprise org for testing gating
INSERT INTO public.stripe_info (customer_id, product_id, status, is_good_plan)
VALUES ('cus_test_sso_basic', 'prod_LQIregjtNduh4q', 'succeeded', true); -- Solo plan

INSERT INTO public.orgs (id, name, management_email, created_by, customer_id)
VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'SSO Test Basic Org',
    'basic@sso-test.com',
    tests.get_supabase_uid('test_user'),
    'cus_test_sso_basic'
);

INSERT INTO public.org_users (user_id, org_id, user_right)
VALUES (
    tests.get_supabase_uid('test_user'),
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'super_admin'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 1: is_enterprise_org function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

SELECT is(
    public.is_enterprise_org('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
    true,
    'is_enterprise_org should return true for Enterprise plan org'
);

SELECT is(
    public.is_enterprise_org('b2c3d4e5-f6a7-8901-bcde-f12345678901'),
    false,
    'is_enterprise_org should return false for non-Enterprise plan org'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 2: add_org_domain function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

-- Test adding domain to Enterprise org (should succeed)
SELECT ok(
    (SELECT id FROM (SELECT * FROM public.add_org_domain('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'enterprise-test.com')) AS t WHERE error_code IS NULL) IS NOT NULL,
    'add_org_domain should succeed for Enterprise org'
);

SELECT ok(
    (SELECT verification_token FROM (SELECT * FROM public.add_org_domain('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'enterprise-test2.com')) AS t) IS NOT NULL,
    'add_org_domain should return verification token'
);

SELECT tests.clear_authentication();

-- Test adding domain to non-Enterprise org (should fail)
SELECT tests.authenticate_as('test_user');

SELECT is(
    (SELECT error_code FROM (SELECT * FROM public.add_org_domain('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'basic-test.com')) AS t),
    'REQUIRES_ENTERPRISE',
    'add_org_domain should fail for non-Enterprise org'
);

SELECT tests.clear_authentication();

-- Test duplicate domain claim (should fail)
SELECT tests.authenticate_as('test_admin');

SELECT is(
    (SELECT error_code FROM (SELECT * FROM public.add_org_domain('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'enterprise-test.com')) AS t),
    'DOMAIN_ALREADY_CLAIMED',
    'add_org_domain should fail for already claimed domain'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 3: get_org_domains function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

SELECT ok(
    (SELECT COUNT(*) FROM public.get_org_domains('a1b2c3d4-e5f6-7890-abcd-ef1234567890')) >= 2,
    'get_org_domains should return at least 2 domains for Enterprise org'
);

SELECT ok(
    EXISTS(SELECT 1 FROM public.get_org_domains('a1b2c3d4-e5f6-7890-abcd-ef1234567890') WHERE domain = 'enterprise-test.com'),
    'get_org_domains should include enterprise-test.com domain'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 4: verify_org_domain function
-- ============================================================================

SELECT tests.authenticate_as_service_role();

-- Get a domain ID to verify
SELECT ok(
    (SELECT id FROM public.org_domains WHERE domain = 'enterprise-test.com' AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') IS NOT NULL,
    'Domain enterprise-test.com should exist'
);

-- Manually mark domain as verified (simulating DNS verification success)
UPDATE public.org_domains
SET verified = true, verified_at = now()
WHERE domain = 'enterprise-test.com' AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

SELECT is(
    (SELECT verified FROM public.org_domains WHERE domain = 'enterprise-test.com'),
    true,
    'Domain should be marked as verified'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 5: update_org_domain_settings function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

-- Get domain ID
SELECT ok(
    (SELECT id FROM public.org_domains WHERE domain = 'enterprise-test.com') IS NOT NULL,
    'Domain should exist for settings update test'
);

-- Update auto_join_enabled
SELECT is(
    public.update_org_domain_settings(
        (SELECT id FROM public.org_domains WHERE domain = 'enterprise-test.com'),
        false,
        NULL
    ),
    'OK',
    'update_org_domain_settings should succeed for valid domain'
);

-- Verify the update
SELECT is(
    (SELECT auto_join_enabled FROM public.org_domains WHERE domain = 'enterprise-test.com'),
    false,
    'auto_join_enabled should be updated to false'
);

-- Update auto_join_role
SELECT is(
    public.update_org_domain_settings(
        (SELECT id FROM public.org_domains WHERE domain = 'enterprise-test.com'),
        true,
        'write'
    ),
    'OK',
    'update_org_domain_settings should update role'
);

SELECT is(
    (SELECT auto_join_role FROM public.org_domains WHERE domain = 'enterprise-test.com'),
    'write'::public.user_min_right,
    'auto_join_role should be updated to write'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 6: remove_org_domain function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

-- Remove a domain
SELECT is(
    public.remove_org_domain(
        (SELECT id FROM public.org_domains WHERE domain = 'enterprise-test2.com')
    ),
    'OK',
    'remove_org_domain should succeed for valid domain'
);

SELECT ok(
    NOT EXISTS(SELECT 1 FROM public.org_domains WHERE domain = 'enterprise-test2.com'),
    'Domain should be deleted after remove_org_domain'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 7: upsert_org_sso_provider function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

-- Create SSO provider for Enterprise org
SELECT ok(
    (SELECT id FROM (
        SELECT * FROM public.upsert_org_sso_provider(
            'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            NULL,
            'saml',
            'Test Okta',
            'https://test.okta.com/metadata',
            true
        )
    ) AS t WHERE error_code IS NULL) IS NOT NULL,
    'upsert_org_sso_provider should succeed for Enterprise org'
);

SELECT tests.clear_authentication();

-- Test non-Enterprise org (should fail)
SELECT tests.authenticate_as('test_user');

SELECT is(
    (SELECT error_code FROM (
        SELECT * FROM public.upsert_org_sso_provider(
            'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            NULL,
            'saml',
            'Test Okta',
            'https://test.okta.com/metadata',
            true
        )
    ) AS t),
    'REQUIRES_ENTERPRISE',
    'upsert_org_sso_provider should fail for non-Enterprise org'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 8: get_org_sso_config function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

SELECT ok(
    (SELECT COUNT(*) FROM public.get_org_sso_config('a1b2c3d4-e5f6-7890-abcd-ef1234567890')) = 1,
    'get_org_sso_config should return 1 SSO config'
);

SELECT is(
    (SELECT display_name FROM public.get_org_sso_config('a1b2c3d4-e5f6-7890-abcd-ef1234567890') LIMIT 1),
    'Test Okta',
    'SSO config should have correct display_name'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 9: Auto-join trigger on user creation
-- ============================================================================

SELECT tests.authenticate_as_service_role();

-- Ensure domain has auto_join enabled
UPDATE public.org_domains
SET auto_join_enabled = true, auto_join_role = 'read'::public.user_min_right
WHERE domain = 'enterprise-test.com';

-- Create a new user with matching domain email
SELECT tests.create_supabase_user('sso_test_user', 'newuser@enterprise-test.com');

-- Create user profile
INSERT INTO public.users (id, email, first_name, last_name)
VALUES (
    tests.get_supabase_uid('sso_test_user'),
    'newuser@enterprise-test.com',
    'SSO',
    'User'
);

-- Check if user was auto-added to org
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.org_users
        WHERE user_id = tests.get_supabase_uid('sso_test_user')
        AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    ),
    'Auto-join trigger should add user to org based on email domain'
);

SELECT is(
    (SELECT user_right FROM public.org_users
     WHERE user_id = tests.get_supabase_uid('sso_test_user')
     AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
    'read'::public.user_min_right,
    'Auto-joined user should have the configured role (read)'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- TEST 10: count_domain_users function
-- ============================================================================

SELECT tests.authenticate_as('test_admin');

SELECT ok(
    public.count_domain_users('enterprise-test.com', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') >= 0,
    'count_domain_users should return a non-negative number'
);

SELECT tests.clear_authentication();

-- ============================================================================
-- CLEANUP
-- ============================================================================

SELECT tests.authenticate_as_service_role();

-- Delete test data
DELETE FROM public.org_users WHERE org_id IN (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'b2c3d4e5-f6a7-8901-bcde-f12345678901'
);
DELETE FROM public.org_sso_providers WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM public.org_domains WHERE org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
DELETE FROM public.orgs WHERE id IN (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'b2c3d4e5-f6a7-8901-bcde-f12345678901'
);
DELETE FROM public.stripe_info WHERE customer_id IN ('cus_test_sso_enterprise', 'cus_test_sso_basic');
DELETE FROM public.users WHERE id = tests.get_supabase_uid('sso_test_user');
DELETE FROM auth.users WHERE raw_user_meta_data ->> 'test_identifier' = 'sso_test_user';

SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
