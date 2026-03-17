BEGIN;

SELECT plan(13);

SELECT tests.authenticate_as_service_role();

-- =============================================================================
-- Setup: clean up any leftover keys from a previous interrupted run, then insert
-- fresh test API keys for service-principal Phase 3 tests.
-- =============================================================================

DELETE FROM public.apikeys WHERE id IN (99960, 99961, 99962);

-- Key 99960: provisioned service principal, mode='all', owned by super_admin user
INSERT INTO public.apikeys (id, user_id, key, mode, name, expires_at, service_principal_provisioned)
VALUES (
    99960,
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'sp3-test-key-all',
    'all',
    'SP3 Test All Mode',
    NULL,
    true
);

-- Key 99961: provisioned service principal, mode='read', owned by super_admin user
INSERT INTO public.apikeys (id, user_id, key, mode, name, expires_at, service_principal_provisioned)
VALUES (
    99961,
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'sp3-test-key-read',
    'read',
    'SP3 Test Read Mode',
    NULL,
    true
);

-- Key 99962: NOT provisioned (service_principal_provisioned = false), mode='all'
INSERT INTO public.apikeys (id, user_id, key, mode, name, expires_at, service_principal_provisioned)
VALUES (
    99962,
    '6aa76066-55ef-4238-ade6-0b32334a4097',
    'sp3-test-key-not-provisioned',
    'all',
    'SP3 Test Not Provisioned',
    NULL,
    false
);

-- =============================================================================
-- Test 1: is_service_principal returns false for a regular human user UUID
-- (6aa76066 IS in apikeys.user_id but is NOT an rbac_id)
-- =============================================================================

SELECT
    is(
        public.is_service_principal('6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
        FALSE,
        'is_service_principal: returns false for a regular human user UUID'
    );

-- =============================================================================
-- Test 2: is_service_principal returns false for a random UUID not in apikeys
-- =============================================================================

SELECT
    is(
        public.is_service_principal('00000000-dead-beef-cafe-000000000002'::uuid),
        FALSE,
        'is_service_principal: returns false for a UUID not present in apikeys at all'
    );

-- =============================================================================
-- Test 3: is_service_principal returns true for the rbac_id of key 99960
-- (provisioned = true)
-- =============================================================================

SELECT
    is(
        public.is_service_principal((SELECT rbac_id FROM public.apikeys WHERE id = 99960)),
        TRUE,
        'is_service_principal: returns true for rbac_id of a provisioned key'
    );

-- =============================================================================
-- Test 4: is_service_principal returns false for the rbac_id of key 99962
-- (provisioned = false)
-- =============================================================================

SELECT
    is(
        public.is_service_principal((SELECT rbac_id FROM public.apikeys WHERE id = 99962)),
        FALSE,
        'is_service_principal: returns false for rbac_id of a non-provisioned key'
    );

-- =============================================================================
-- Test 5: check_min_rights_legacy with SP 'all' mode key in target org
-- The owner (6aa76066) is super_admin in org 046a36ac..., so 'all' inherits
-- super_admin and should pass a 'read' check.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'read'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99960),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights_legacy: SP all-mode key passes read check via owner super_admin right'
    );

-- =============================================================================
-- Test 6: check_min_rights_legacy with SP 'all' mode key in target org
-- Owner is super_admin, so 'all' mode should also pass a 'write' check.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'write'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99960),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights_legacy: SP all-mode key passes write check via owner super_admin right'
    );

-- =============================================================================
-- Test 7: check_min_rights_legacy with SP 'read' mode key in target org
-- 'read' mode maps to user_min_right 'read', so a 'read' check should pass.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'read'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99961),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights_legacy: SP read-mode key passes read check'
    );

-- =============================================================================
-- Test 8: check_min_rights_legacy with SP 'read' mode key in target org
-- 'read' mode < 'write', so a 'write' check should fail.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'write'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99961),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights_legacy: SP read-mode key fails write check (read < write)'
    );

-- =============================================================================
-- Test 9: check_min_rights_legacy with SP key against an org it does not belong to
-- The key has no limited_to_orgs restriction, but the owner has no membership in
-- the random org, so 'all' mode lookup returns NULL and access should be denied.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'read'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99960),
            '00000000-0000-0000-0000-000000000099'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights_legacy: SP all-mode key denied for org where owner has no membership'
    );

-- =============================================================================
-- Test 10: check_min_rights_legacy with non-provisioned SP (rbac_id of key 99962)
-- The NOT provisioned key should not satisfy the SP fallback, so it returns false.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy(
            'read'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99962),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights_legacy: non-provisioned SP rbac_id is denied (not a service principal)'
    );

-- =============================================================================
-- Test 11: check_min_rights_legacy_no_password_policy with SP 'read' mode key
-- Should behave identically to check_min_rights_legacy for read check.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy_no_password_policy(
            'read'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99961),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights_legacy_no_password_policy: SP read-mode key passes read check'
    );

-- =============================================================================
-- Test 12: check_min_rights_legacy_no_password_policy with SP 'read' mode key
-- 'read' < 'admin', so this should fail.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy_no_password_policy(
            'admin'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99961),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        FALSE,
        'check_min_rights_legacy_no_password_policy: SP read-mode key fails admin check (read < admin)'
    );

-- =============================================================================
-- Test 13: check_min_rights_legacy_no_password_policy with SP 'all' mode key
-- Owner is super_admin in target org, so all-mode passes an 'admin' check.
-- =============================================================================

SELECT
    is(
        public.check_min_rights_legacy_no_password_policy(
            'admin'::public.user_min_right,
            (SELECT rbac_id FROM public.apikeys WHERE id = 99960),
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid,
            NULL::character varying,
            NULL::bigint
        ),
        TRUE,
        'check_min_rights_legacy_no_password_policy: SP all-mode key passes admin check via owner super_admin right'
    );

SELECT * FROM finish();

ROLLBACK;
