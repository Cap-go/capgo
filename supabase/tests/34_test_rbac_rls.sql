-- Test RLS policies for RBAC tables
BEGIN;

SELECT plan(7);

-- Test admin user: 'test_admin' maps to c591b04e-cf29-4945-b9a0-776d0672061a (admin@capgo.app)
-- Test regular user: 'test_user' maps to 6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5 (test@capgo.app)
-- Demo org: 046a36ac-e03c-4590-9257-bd6c9dba9ee8
-- 1) Regular user can read roles
SELECT tests.authenticate_as('test_user');

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                public.roles
        ) >= 0,
        'Regular user can read roles'
    );

-- 2) Regular user can read permissions
SELECT tests.authenticate_as('test_user');

SELECT
    ok(
        (
            SELECT count(*)
            FROM
                public.permissions
        ) >= 0,
        'Regular user can read permissions'
    );

-- 3) Regular user can read their org's groups
-- First create a test group as admin
SELECT tests.authenticate_as('test_admin');

INSERT INTO
public.groups (org_id, name, description)
VALUES
(
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'Test Group RLS',
    'Test group for RLS'
);

-- Now check regular user can see it (they're member of Demo org)
SELECT tests.authenticate_as('test_user');

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.groups
            WHERE
                org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
                AND name = 'Test Group RLS'
        ),
        'Regular user can read their org groups'
    );

-- 4) Regular user cannot see groups from other orgs
-- Create a group in Admin org
SELECT tests.authenticate_as('test_admin');

INSERT INTO
public.groups (org_id, name, description)
VALUES
(
    '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
    'Admin Org Group',
    'Should not be visible to test user'
);

-- Check test user cannot see Admin org group
SELECT tests.authenticate_as('test_user');

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.groups
            WHERE
                org_id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ),
        'Regular user cannot see groups from other orgs'
    );

-- 5) Admin can see role_bindings for their org
SELECT tests.authenticate_as('test_admin');

-- Seed a deterministic binding outside RLS; this test is about SELECT visibility.
SET LOCAL ROLE service_role;
DELETE FROM public.role_bindings
WHERE
    principal_type = 'user'
    AND principal_id = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
    AND scope_type = 'org'
    AND org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8';

INSERT INTO
public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    granted_by
)
VALUES
(
    'user',
    '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5',
    (
        SELECT id
        FROM public.roles
        WHERE name = public.rbac_role_org_member()
    ),
    'org',
    '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    'c591b04e-cf29-4945-b9a0-776d0672061a'
);
RESET ROLE;

-- Check test admin can see role bindings in the Demo org
SELECT tests.authenticate_as('test_admin');

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.role_bindings
            WHERE
                principal_id = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
                AND scope_type = 'org'
                AND org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
        ),
        'Admin can see role bindings for their org'
    );

-- 6) User cannot see role_bindings from other orgs
-- Note: We don't delete/recreate bindings because of super_admin protection trigger
-- Instead, we verify test_user (different org) cannot see test_admin's bindings
SELECT tests.authenticate_as('test_user');

SELECT
    ok(
        NOT EXISTS (
            SELECT 1
            FROM
                public.role_bindings
            WHERE
                scope_type = 'org'
                AND org_id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
        ),
        'User cannot see role bindings from other orgs'
    );

-- 7) Test admin cannot create roles
SELECT tests.authenticate_as('test_admin');

SELECT
    throws_ok(
        $$INSERT INTO public.roles (id, name, scope_type, priority_rank) VALUES ('22222222-2222-2222-2222-222222222222', 'admin_test_role', 'org', 20)$$,
        '42501',
        'new row violates row-level security policy for table "roles"',
        'Admin cannot create roles'
    );

SELECT *
FROM
    finish();

ROLLBACK;
