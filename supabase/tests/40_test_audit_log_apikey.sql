-- Test that audit logs are created correctly when using API key authentication
-- This verifies the fix for the issue where CLI/API users were not logged in audit_logs
-- because get_identity() was called without key_mode parameter
BEGIN;

-- Use existing seed identities:
-- API key: ae6e7458-c46d-4c00-aa3b-153b0b8520ea (mode: all, user: 6aa76066-55ef-4238-ade6-0b32334a4097)
-- Org: 046a36ac-e03c-4590-9257-bd6c9dba9ee8
-- App: com.demo.app

SELECT plan(6);

-- Test 1: Verify get_identity returns user_id when API key header is set
DO $$
BEGIN
  PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);
END $$;

SELECT
    is(
        public.get_identity('{read,upload,write,all}'::public.key_mode []),
        '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid,
        'get_identity with key_mode returns API key user_id'
    );

-- Test 2: Verify get_identity WITHOUT parameters returns NULL for API key (the old broken behavior)
-- Note: This shows the original bug - parameterless get_identity doesn't check API keys
SELECT
    is(
        public.get_identity(),
        NULL,
        'get_identity without key_mode returns NULL for API key (original bug)'
    );

-- Test 3: Insert app_version with API key context and verify audit log is created
DO $$
DECLARE
  v_version_id bigint;
  v_audit_count int;
BEGIN
  -- Set API key context
  PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);

  -- Insert a new app_version
  INSERT INTO public.app_versions (app_id, name, owner_org, user_id, storage_provider)
  VALUES ('com.demo.app', '99.0.0-test-audit', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'r2')
  RETURNING id INTO v_version_id;

  -- Check that an audit log was created
  SELECT COUNT(*) INTO v_audit_count
  FROM public.audit_logs
  WHERE table_name = 'app_versions'
    AND record_id = v_version_id::text
    AND operation = 'INSERT'
    AND user_id = '6aa76066-55ef-4238-ade6-0b32334a4097';

  IF v_audit_count = 0 THEN
    RAISE EXCEPTION 'No audit log created for app_version INSERT with API key';
  END IF;

  RAISE NOTICE 'Audit log created for app_version INSERT (version_id: %)', v_version_id;
END $$;

SELECT ok(TRUE, 'app_version INSERT with API key creates audit log');

-- Test 4: Update app_version with API key context and verify audit log is created
DO $$
DECLARE
  v_audit_count int;
BEGIN
  -- Set API key context
  PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);

  -- Update the app_version
  UPDATE public.app_versions
  SET comment = 'Updated via API key test'
  WHERE name = '99.0.0-test-audit' AND app_id = 'com.demo.app';

  -- Check that an audit log was created for the UPDATE
  SELECT COUNT(*) INTO v_audit_count
  FROM public.audit_logs
  WHERE table_name = 'app_versions'
    AND operation = 'UPDATE'
    AND user_id = '6aa76066-55ef-4238-ade6-0b32334a4097'
    AND 'comment' = ANY(changed_fields);

  IF v_audit_count = 0 THEN
    RAISE EXCEPTION 'No audit log created for app_version UPDATE with API key';
  END IF;

  RAISE NOTICE 'Audit log created for app_version UPDATE';
END $$;

SELECT
    ok(TRUE, 'app_version UPDATE with API key creates audit log with changed_fields');

-- Test 5: Delete app_version with API key context and verify audit log is created
DO $$
DECLARE
  v_version_id bigint;
  v_audit_count int;
BEGIN
  -- Set API key context
  PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);

  -- Get the version id before deleting
  SELECT id INTO v_version_id
  FROM public.app_versions
  WHERE name = '99.0.0-test-audit' AND app_id = 'com.demo.app';

  -- Delete the app_version
  DELETE FROM public.app_versions
  WHERE name = '99.0.0-test-audit' AND app_id = 'com.demo.app';

  -- Check that an audit log was created for the DELETE
  SELECT COUNT(*) INTO v_audit_count
  FROM public.audit_logs
  WHERE table_name = 'app_versions'
    AND record_id = v_version_id::text
    AND operation = 'DELETE'
    AND user_id = '6aa76066-55ef-4238-ade6-0b32334a4097';

  IF v_audit_count = 0 THEN
    RAISE EXCEPTION 'No audit log created for app_version DELETE with API key';
  END IF;

  RAISE NOTICE 'Audit log created for app_version DELETE (version_id: %)', v_version_id;
END $$;

SELECT ok(TRUE, 'app_version DELETE with API key creates audit log');

-- Test 6: Verify audit log contains correct old_record and new_record data
DO $$
DECLARE
  v_version_id bigint;
  v_audit_record record;
BEGIN
  -- Set API key context
  PERFORM set_config('request.headers', '{"capgkey": "ae6e7458-c46d-4c00-aa3b-153b0b8520ea"}', true);

  -- Insert a new app_version
  INSERT INTO public.app_versions (app_id, name, owner_org, user_id, storage_provider, comment)
  VALUES ('com.demo.app', '99.0.1-test-audit', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'r2', 'Initial comment')
  RETURNING id INTO v_version_id;

  -- Check the INSERT audit log
  SELECT * INTO v_audit_record
  FROM public.audit_logs
  WHERE table_name = 'app_versions'
    AND record_id = v_version_id::text
    AND operation = 'INSERT'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_audit_record.old_record IS NOT NULL THEN
    RAISE EXCEPTION 'INSERT audit log should have NULL old_record';
  END IF;

  IF v_audit_record.new_record IS NULL THEN
    RAISE EXCEPTION 'INSERT audit log should have non-NULL new_record';
  END IF;

  IF v_audit_record.new_record->>'name' != '99.0.1-test-audit' THEN
    RAISE EXCEPTION 'INSERT audit log new_record should contain the version name';
  END IF;

  -- Update the version
  UPDATE public.app_versions
  SET comment = 'Updated comment'
  WHERE id = v_version_id;

  -- Check the UPDATE audit log
  SELECT * INTO v_audit_record
  FROM public.audit_logs
  WHERE table_name = 'app_versions'
    AND record_id = v_version_id::text
    AND operation = 'UPDATE'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_audit_record.old_record IS NULL THEN
    RAISE EXCEPTION 'UPDATE audit log should have non-NULL old_record';
  END IF;

  IF v_audit_record.new_record IS NULL THEN
    RAISE EXCEPTION 'UPDATE audit log should have non-NULL new_record';
  END IF;

  IF v_audit_record.old_record->>'comment' != 'Initial comment' THEN
    RAISE EXCEPTION 'UPDATE audit log old_record should contain the old comment';
  END IF;

  IF v_audit_record.new_record->>'comment' != 'Updated comment' THEN
    RAISE EXCEPTION 'UPDATE audit log new_record should contain the new comment';
  END IF;

  -- Cleanup
  DELETE FROM public.app_versions WHERE id = v_version_id;

  RAISE NOTICE 'Audit log old_record and new_record verification passed';
END $$;

SELECT ok(TRUE, 'audit log contains correct old_record and new_record data');

-- Finish
SELECT *
FROM
    finish();

-- Roll back any changes done in this test
ROLLBACK;
