BEGIN;

SELECT plan(22);

-- =============================================================================
-- Test is_apikey_expired() function
-- =============================================================================

-- Test 1: NULL expires_at should return false (never expires)
SELECT
    is(
        is_apikey_expired(NULL),
        false,
        'is_apikey_expired: NULL expires_at returns false (never expires)'
    );

-- Test 2: Future expiration should return false
SELECT
    is(
        is_apikey_expired(now() + interval '1 day'),
        false,
        'is_apikey_expired: Future date returns false (not expired)'
    );

-- Test 3: Past expiration should return true
SELECT
    is(
        is_apikey_expired(now() - interval '1 day'),
        true,
        'is_apikey_expired: Past date returns true (expired)'
    );

-- Test 4: Expiration exactly at now should return false (not yet expired)
SELECT
    is(
        is_apikey_expired(now()),
        false,
        'is_apikey_expired: Current time returns false (boundary case)'
    );

-- Test 5: Far future expiration
SELECT
    is(
        is_apikey_expired(now() + interval '1 year'),
        false,
        'is_apikey_expired: 1 year in future returns false'
    );

-- Test 6: Just expired (1 second ago)
SELECT
    is(
        is_apikey_expired(now() - interval '1 second'),
        true,
        'is_apikey_expired: 1 second ago returns true (just expired)'
    );

-- =============================================================================
-- Test cleanup_expired_apikeys() function
-- =============================================================================

-- Create test API keys with different expiration dates
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
    -- Key expired 31 days ago (should be deleted)
    (99901, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-expired-31d', 'all', 'Test Expired 31 days', now() - interval '31 days'),
    -- Key expired 35 days ago (should be deleted)
    (99902, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-expired-35d', 'all', 'Test Expired 35 days', now() - interval '35 days'),
    -- Key expired 29 days ago (should NOT be deleted - within grace period)
    (99903, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-expired-29d', 'all', 'Test Expired 29 days', now() - interval '29 days'),
    -- Key expired 1 day ago (should NOT be deleted - within grace period)
    (99904, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-expired-1d', 'all', 'Test Expired 1 day', now() - interval '1 day'),
    -- Key not expired yet (should NOT be deleted)
    (99905, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-not-expired', 'all', 'Test Not Expired', now() + interval '30 days'),
    -- Key with no expiration (should NOT be deleted)
    (99906, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-no-expiry', 'all', 'Test No Expiry', NULL);

-- Test 7: Verify test keys exist before cleanup
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id IN (99901, 99902, 99903, 99904, 99905, 99906))::integer,
        6,
        'cleanup_expired_apikeys: All 6 test keys exist before cleanup'
    );

-- Run cleanup
SELECT cleanup_expired_apikeys();

-- Test 8: Keys expired > 30 days ago should be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99901)::integer,
        0,
        'cleanup_expired_apikeys: Key expired 31 days ago was deleted'
    );

-- Test 9: Keys expired > 30 days ago should be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99902)::integer,
        0,
        'cleanup_expired_apikeys: Key expired 35 days ago was deleted'
    );

-- Test 10: Keys expired within 30 days should NOT be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99903)::integer,
        1,
        'cleanup_expired_apikeys: Key expired 29 days ago was NOT deleted (grace period)'
    );

-- Test 11: Keys expired within 30 days should NOT be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99904)::integer,
        1,
        'cleanup_expired_apikeys: Key expired 1 day ago was NOT deleted (grace period)'
    );

-- Test 12: Keys not expired should NOT be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99905)::integer,
        1,
        'cleanup_expired_apikeys: Key not expired was NOT deleted'
    );

-- Test 13: Keys with no expiration should NOT be deleted
SELECT
    is(
        (SELECT COUNT(*) FROM apikeys WHERE id = 99906)::integer,
        1,
        'cleanup_expired_apikeys: Key with no expiry was NOT deleted'
    );

-- =============================================================================
-- Test get_identity with expired API key
-- =============================================================================

-- Create a test expired API key
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
    (99907, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-for-identity-expired', 'all', 'Test Identity Expired', now() - interval '1 day');

-- Create a test valid API key
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
    (99908, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-for-identity-valid', 'all', 'Test Identity Valid', now() + interval '30 days');

-- Set up request headers with expired key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-for-identity-expired"}', true);
END $$;

-- Test 14: get_identity should return NULL for expired key
SELECT
    is(
        get_identity('{all}'),
        NULL,
        'get_identity: Returns NULL for expired API key'
    );

-- Test 15: get_identity_apikey_only should return NULL for expired key
SELECT
    is(
        get_identity_apikey_only('{all}'),
        NULL,
        'get_identity_apikey_only: Returns NULL for expired API key'
    );

-- Set up request headers with valid key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-for-identity-valid"}', true);
END $$;

-- Test 16: get_identity should return user_id for valid key
SELECT
    is(
        get_identity('{all}'),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'get_identity: Returns user_id for valid (not expired) API key'
    );

-- Test 17: get_identity_apikey_only should return user_id for valid key
SELECT
    is(
        get_identity_apikey_only('{all}'),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'get_identity_apikey_only: Returns user_id for valid (not expired) API key'
    );

-- Reset headers
DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

-- =============================================================================
-- Test get_orgs_v6 with expired API key
-- =============================================================================

-- Create test API keys for get_orgs_v6 tests
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
    (99909, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-orgs-expired', 'all', 'Test Orgs Expired', now() - interval '1 day'),
    (99910, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-orgs-valid', 'all', 'Test Orgs Valid', now() + interval '30 days');

-- Set up request headers with expired key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-orgs-expired"}', true);
END $$;

-- Test 18: get_orgs_v6 should raise exception for expired key
SELECT
    throws_ok(
        'SELECT * FROM get_orgs_v6()',
        'P0001',
        'API key has expired',
        'get_orgs_v6: Raises exception for expired API key'
    );

-- Set up request headers with valid key
DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-orgs-valid"}', true);
END $$;

-- Test 19: get_orgs_v6 should return results for valid key
SELECT
    ok(
        (SELECT COUNT(*) > 0 FROM get_orgs_v6()),
        'get_orgs_v6: Returns results for valid (not expired) API key'
    );

-- Test 20: get_orgs_v6 with no expiration key should work
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
    (99911, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-orgs-no-expiry', 'all', 'Test Orgs No Expiry', NULL);

DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-orgs-no-expiry"}', true);
END $$;

SELECT
    ok(
        (SELECT COUNT(*) > 0 FROM get_orgs_v6()),
        'get_orgs_v6: Returns results for API key with no expiration (NULL)'
    );

-- Reset headers
DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

-- =============================================================================
-- Test organization API key policy columns
-- =============================================================================

-- Test 21: get_orgs_v6 with expired key AND limited_to_orgs should also reject
INSERT INTO apikeys (id, user_id, key, mode, name, expires_at, limited_to_orgs)
VALUES
    (99912, '6aa76066-55ef-4238-ade6-0b32334a4097', 'test-key-orgs-expired-limited', 'all', 'Test Orgs Expired Limited', now() - interval '1 day', '{046a36ac-e03c-4590-9257-bd6c9dba9ee8}');

DO $$
BEGIN
    PERFORM set_config('request.headers', '{"capgkey": "test-key-orgs-expired-limited"}', true);
END $$;

SELECT
    throws_ok(
        'SELECT * FROM get_orgs_v6()',
        'P0001',
        'API key has expired',
        'get_orgs_v6: Raises exception for expired API key with limited_to_orgs'
    );

-- Reset headers
DO $$
BEGIN
    PERFORM set_config('request.headers', '{}', true);
END $$;

-- Test 22: Verify org policy columns exist and have correct defaults
SELECT
    ok(
        (SELECT require_apikey_expiration = false AND max_apikey_expiration_days IS NULL
         FROM orgs WHERE id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
        'Org policy columns have correct defaults (require_apikey_expiration=false, max_apikey_expiration_days=NULL)'
    );

SELECT *
FROM finish();

ROLLBACK;
