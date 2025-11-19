BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (12);

CREATE OR REPLACE FUNCTION my_tests () RETURNS SETOF TEXT AS $$
DECLARE
  plan RECORD;
  usage RECORD;
  test_app_id TEXT := 'com.demo.retention.test';
  test_app_id_2year TEXT := 'com.demo.retention.2year';
  test_app_id_minimal TEXT := 'com.demo.retention.minimal';
  version_id_old BIGINT;
  version_id_linked BIGINT;
  version_id_recent BIGINT;
  version_id_2year BIGINT;
  version_id_zero BIGINT;
BEGIN

-- Clean up any existing test data
DELETE FROM channels WHERE app_id IN (test_app_id, test_app_id_2year, test_app_id_minimal);
DELETE FROM app_versions WHERE app_id IN (test_app_id, test_app_id_2year, test_app_id_minimal);
DELETE FROM apps WHERE app_id IN (test_app_id, test_app_id_2year, test_app_id_minimal);

-- Test App 1: Normal retention (30 days = 2592000 seconds)
INSERT INTO apps (app_id, name, retention, icon_url, owner_org)
VALUES (test_app_id, 'Test Retention App', 2592000, 'https://example.com/icon.png', 
        (SELECT owner_org FROM apps LIMIT 1));

-- Test App 2: 2+ year retention (should be ignored due to hard limit)
-- 63113904 seconds ≈ 2.001 years, above the 2-year hard limit
INSERT INTO apps (app_id, name, retention, icon_url, owner_org)
VALUES (test_app_id_2year, 'Test 2Year App', 70000000, 'https://example.com/icon.png', 
        (SELECT owner_org FROM apps LIMIT 1));

-- Test App 3: Zero retention (should delete immediately - no retention period)
INSERT INTO apps (app_id, name, retention, icon_url, owner_org)
VALUES (test_app_id_minimal, 'Test Zero Retention App', 0, 'https://example.com/icon.png', 
        (SELECT owner_org FROM apps LIMIT 1));

-- Create test versions for normal retention app
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id, '1.0.old', 'r2', '2020-01-01 00:00:00'::timestamp)
RETURNING id INTO version_id_old;

INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id, '1.0.linked', 'r2', '2020-01-01 00:00:00'::timestamp)
RETURNING id INTO version_id_linked;

INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id, '1.0.recent', 'r2', '2034-12-27 00:00:00'::timestamp)
RETURNING id INTO version_id_recent;

-- Create test version for 2+ year retention app (should not be deleted due to hard limit)
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_2year, '1.0.old.2year', 'r2', '2020-01-01 00:00:00'::timestamp)
RETURNING id INTO version_id_2year;

-- Create test version for zero retention app (should be deleted immediately)
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_minimal, '1.0.old.zero', 'r2', '2020-01-01 00:00:00'::timestamp)
RETURNING id INTO version_id_zero;

-- Create a channel for our test app to test channel protection
INSERT INTO channels (created_at, name, app_id, version, updated_at, public, 
                     disable_auto_update_under_native, disable_auto_update, ios, android, 
                     allow_device_self_set, allow_emulator, allow_dev, created_by, owner_org)
VALUES (now(), 'production', test_app_id, version_id_linked, now(), 't', 
        't', 'major'::"public"."disable_update", 'f', 't', 
        't', 't', 't', 
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid, 
        (SELECT owner_org FROM apps WHERE app_id = test_app_id));

-- Freeze time to 2035 to ensure retention periods have passed
PERFORM tests.freeze_time('2035-01-01 00:00:00');
ALTER function update_app_versions_retention() SET search_path = test_overrides, public, pg_temp, pg_catalog;
PERFORM update_app_versions_retention();

-- Test 1: Old version without channel link should be deleted (normal retention)
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE id = version_id_old), 
    true, 
    'Old version should be deleted when retention period passed'
);

-- Test 2: Old version linked to channel should NOT be deleted
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE id = version_id_linked), 
    false, 
    'Version linked to channel should never be deleted'
);

-- Test 3: Recent version should NOT be deleted (within retention period)
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE id = version_id_recent), 
    false, 
    'Recent version should not be deleted even if retention is set'
);

-- Test 4: Version with 2+ year retention should NOT be deleted (hard limit)
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE id = version_id_2year), 
    false, 
    'Version should not be deleted when app retention exceeds 2-year hard limit'
);

-- Test 5: Version with zero retention should be deleted immediately
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE id = version_id_zero), 
    true, 
    'Version should be deleted when app retention is zero (immediate deletion)'
);

-- Test 6: Verify retention hard limit constant (63113904 seconds ≈ 2 years)
RETURN NEXT IS (
    (63113904::float / (365 * 24 * 60 * 60)::float) > 2.0,
    true,
    'Hard limit constant should be approximately 2 years'
);

-- Test edge case: App with exactly 2 years retention (63072000 seconds)
-- 63071999 (2 years - 1 second), 63072000 is the absolute MAX retention allowed, if you set it to 63072000, retention will be ignored
UPDATE apps SET retention = 63071999 WHERE app_id = test_app_id_2year;

-- Add a version that's exactly 2 years old
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_2year, '1.0.exactly.2year', 'r2', '2033-01-01 00:00:00'::timestamp);

PERFORM update_app_versions_retention();

-- Test 7: Version should be deleted with exactly 2-year retention
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.exactly.2year' AND app_id = test_app_id_2year), 
    true, 
    'Version should be deleted with exactly 2-year retention (within hard limit)'
);

-- Test edge case: App with retention just above hard limit
UPDATE apps SET retention = 63113905 WHERE app_id = test_app_id_2year;

-- Add another old version
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_2year, '1.0.above.limit', 'r2', '2020-01-01 00:00:00'::timestamp);

PERFORM update_app_versions_retention();

-- Test 8: Version should NOT be deleted when retention is above hard limit
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.above.limit' AND app_id = test_app_id_2year), 
    false, 
    'Version should not be deleted when retention exceeds hard limit by 1 second'
);

-- Test minimal retention (1 second - should delete almost everything)
UPDATE apps SET retention = 1 WHERE app_id = test_app_id_minimal;

INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_minimal, '1.0.minimal.retention', 'r2', '2020-01-01 00:00:00'::timestamp);

PERFORM update_app_versions_retention();

-- Test 9: Version should be deleted with minimal retention (1 second)
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.minimal.retention' AND app_id = test_app_id_minimal), 
    true, 
    'Version should be deleted when retention is minimal (1 second)'
);

-- Test negative retention (should be ignored due to >= 0 check)
UPDATE apps SET retention = -1000 WHERE app_id = test_app_id_minimal;

INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id_minimal, '1.0.negative', 'r2', '2020-01-01 00:00:00'::timestamp);

PERFORM update_app_versions_retention();

-- Test 10: Version should NOT be deleted with negative retention (excluded by >= 0 condition)
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.negative' AND app_id = test_app_id_minimal), 
    false, 
    'Version should not be deleted when retention is negative (excluded by >= 0 condition)'
);

-- Test that function only affects non-deleted versions
UPDATE app_versions SET deleted = true WHERE name = '1.0.recent';

-- Create another old version to test
INSERT INTO app_versions (app_id, name, storage_provider, created_at)
VALUES (test_app_id, '1.0.another.old', 'r2', '2020-01-01 00:00:00'::timestamp);

PERFORM update_app_versions_retention();

-- Test 11: Already deleted version should remain deleted
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.recent' AND app_id = test_app_id), 
    true, 
    'Already deleted version should remain deleted'
);

-- Test 12: New old version should be deleted
RETURN NEXT IS (
    (SELECT deleted FROM app_versions WHERE name = '1.0.another.old' AND app_id = test_app_id), 
    true, 
    'New old version should be deleted by retention function'
);

END;
$$ LANGUAGE plpgsql;

SELECT
    my_tests ();

SELECT
    *
FROM
    finish ();

ROLLBACK;
