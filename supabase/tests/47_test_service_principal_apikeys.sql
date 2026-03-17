BEGIN;

SELECT plan(14);

SELECT tests.authenticate_as_service_role();

-- =============================================================================
-- Setup: create test API keys for service-principal tests
-- =============================================================================

INSERT INTO apikeys (id, user_id, key, mode, name, expires_at)
VALUES
-- Valid key, not yet provisioned
(
    99950,
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'sp-test-key-valid',
    'all',
    'SP Test Valid',
    NULL
),
-- Expired key, not provisioned
(
    99951,
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'sp-test-key-expired',
    'all',
    'SP Test Expired',
    now() - interval '1 day'
);

-- =============================================================================
-- Test 1: service_principal_provisioned defaults to false
-- =============================================================================

SELECT
    is(
        (SELECT service_principal_provisioned FROM apikeys WHERE id = 99950),
        FALSE,
        'service_principal_provisioned: defaults to false on new keys'
    );

-- =============================================================================
-- Test 2: get_service_principal_info returns correct info for valid key
-- =============================================================================

SELECT
    is(
        (SELECT apikey_id FROM get_service_principal_info('sp-test-key-valid')),
        99950::bigint,
        'get_service_principal_info: returns correct apikey_id for valid key'
    );

SELECT
    is(
        (SELECT owner_user_id FROM get_service_principal_info('sp-test-key-valid')),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'get_service_principal_info: returns correct owner_user_id'
    );

SELECT
    is(
        (SELECT is_provisioned FROM get_service_principal_info('sp-test-key-valid')),
        FALSE,
        'get_service_principal_info: is_provisioned is false before provisioning'
    );

SELECT
    is(
        (SELECT key_mode FROM get_service_principal_info('sp-test-key-valid')),
        'all'::"public"."key_mode",
        'get_service_principal_info: returns correct key_mode'
    );

SELECT
    is(
        (SELECT is_expired FROM get_service_principal_info('sp-test-key-valid')),
        FALSE,
        'get_service_principal_info: is_expired is false for non-expired key'
    );

-- =============================================================================
-- Test 3: get_service_principal_info returns expired=true for expired key
-- =============================================================================

SELECT
    is(
        (SELECT is_expired FROM get_service_principal_info('sp-test-key-expired')),
        TRUE,
        'get_service_principal_info: is_expired is true for expired key'
    );

-- =============================================================================
-- Test 4: get_service_principal_info returns empty for unknown key
-- =============================================================================

SELECT
    is(
        (SELECT count(*) FROM get_service_principal_info('nonexistent-key-xyz'))::integer,
        0,
        'get_service_principal_info: returns no rows for unknown key'
    );

-- =============================================================================
-- Test 5: service_principal_id (rbac_id) is returned correctly
-- =============================================================================

SELECT
    is(
        (SELECT service_principal_id FROM get_service_principal_info('sp-test-key-valid')),
        (SELECT rbac_id FROM apikeys WHERE id = 99950),
        'get_service_principal_info: service_principal_id matches rbac_id on apikeys row'
    );

-- =============================================================================
-- Test 6: mark_service_principal_provisioned marks the key
-- =============================================================================

SELECT mark_service_principal_provisioned(
    99950,
    (SELECT rbac_id FROM apikeys WHERE id = 99950)
);

SELECT
    is(
        (SELECT service_principal_provisioned FROM apikeys WHERE id = 99950),
        TRUE,
        'mark_service_principal_provisioned: sets service_principal_provisioned=true'
    );

-- =============================================================================
-- Test 7: get_service_principal_info shows is_provisioned=true after marking
-- =============================================================================

SELECT
    is(
        (SELECT is_provisioned FROM get_service_principal_info('sp-test-key-valid')),
        TRUE,
        'get_service_principal_info: is_provisioned=true after mark_service_principal_provisioned'
    );

-- =============================================================================
-- Test 8: mark_service_principal_provisioned raises error on rbac_id mismatch
-- =============================================================================

SELECT
    throws_ok(
        $$SELECT mark_service_principal_provisioned(99951, '00000000-0000-0000-0000-000000000099'::uuid)$$,
        'P0001',
        NULL,
        'mark_service_principal_provisioned: raises exception on rbac_id mismatch'
    );

-- =============================================================================
-- Test 9: mark_service_principal_provisioned raises error for unknown apikey_id
-- =============================================================================

SELECT
    throws_ok(
        $$SELECT mark_service_principal_provisioned(99999, '00000000-0000-0000-0000-000000000099'::uuid)$$,
        'P0001',
        NULL,
        'mark_service_principal_provisioned: raises exception for unknown apikey_id'
    );

SELECT * FROM finish();

ROLLBACK;
