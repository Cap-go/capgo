BEGIN;
CREATE EXTENSION "basejump-supabase_test_helpers";


SELECT plan(2);

CREATE OR REPLACE FUNCTION my_tests(
) RETURNS SETOF TEXT AS $$
DECLARE
  plan RECORD;
  usage RECORD;
BEGIN

INSERT INTO app_versions (app_id, name, storage_provider)
VALUES ('com.demo.app', '1.0.9839877812abc', 'r2');

INSERT INTO app_versions (app_id, name, storage_provider)
VALUES ('com.demo.app', '1.0.9839877812xyz', 'r2');

INSERT INTO app_versions (app_id, name, storage_provider)
VALUES ('com.demo.app', '1.0.9839877812tuv', 'r2');

-- INSERT 

UPDATE channels
SET version=(select id from app_versions where name='1.0.9839877812xyz' and app_id = 'com.demo.app')
where name='production';

PERFORM tests.freeze_time('2035-01-01 00:00:00');
ALTER PROCEDURE update_app_versions_retention() SET search_path = test_overrides, public, pg_temp, pg_catalog;
CALL update_app_versions_retention();

RETURN NEXT IS ((select deleted from app_versions where name='1.0.9839877812abc' and app_id='com.demo.app'), true, 'update_app_versions_retention deleted unused bundle');
RETURN NEXT IS ((select deleted from app_versions where name='1.0.9839877812xyz' and app_id='com.demo.app'), false, 'update_app_versions_retention did not delete bundle linked to channel');

END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * FROM finish();
ROLLBACK;
