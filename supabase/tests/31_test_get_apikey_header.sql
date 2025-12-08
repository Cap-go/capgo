BEGIN;

-- Plan tests
SELECT plan(5);

-- Authenticate to simulate real JWT-based session
SELECT tests.authenticate_as('test_user');

-- Case 1: Authorization contains a JWT with Bearer prefix
SELECT
    set_config(
        'request.headers',
        '{"authorization": "Bearer aaa.bbb.ccc"}',
        true
    );

SELECT
    is(
        public.get_apikey_header(),
        null,
        'get_apikey_header returns NULL when Authorization is a JWT (Bearer)'
    );

-- Also ensure apikey-only identity does not pick up JWT Authorization
SELECT
    is(
        public.get_identity_apikey_only('{read,all}'),
        null,
        'get_identity_apikey_only returns NULL when only JWT Authorization present'
    );

-- But get_identity should still use real auth uid
SELECT
    is(
        public.get_identity('{read,all}'),
        tests.get_supabase_uid('test_user'),
        'get_identity returns authenticated user when JWT session present'
    );

-- Case 2: Authorization contains a raw token without Bearer prefix (should be treated as API key value)
SELECT
    set_config(
        'request.headers',
        '{"authorization": "aaa.bbb.ccc"}',
        true
    );

SELECT
    is(
        public.get_apikey_header(),
        'aaa.bbb.ccc',
        'get_apikey_header returns Authorization value when not starting with Bearer'
    );

-- Case 3: capgkey present alongside JWT Authorization; capgkey should be returned
SELECT
    set_config(
        'request.headers',
        '{"capgkey": "67eeaff4-ae4c-49a6-8eb1-0875f5369de1", "authorization": "Bearer aaa.bbb.ccc"}',
        true
    );

SELECT
    is(
        public.get_apikey_header(),
        '67eeaff4-ae4c-49a6-8eb1-0875f5369de1',
        'get_apikey_header prefers capgkey when present, ignoring JWT Authorization'
    );

-- Cleanup
SELECT tests.clear_authentication();

SELECT set_config('request.headers', null, true);

SELECT *
FROM
    finish();

ROLLBACK;
