BEGIN;

SELECT
    plan (6);

-- Test basic get_org_perm_for_apikey
SELECT
    is (
        get_org_perm_for_apikey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app'
        ),
        'perm_owner',
        'get_org_perm_for_apikey test - has right'
    );

SELECT
    is (
        get_org_perm_for_apikey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ee',
            'com.demo.app'
        ),
        'INVALID_APIKEY',
        'get_org_perm_for_apikey test - wrong key'
    );

SELECT
    is (
        get_org_perm_for_apikey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demo.app2'
        ),
        'NO_APP',
        'get_org_perm_for_apikey test - missign app'
    );

SELECT
    is (
        get_org_perm_for_apikey (
            'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
            'com.demoadmin.app'
        ),
        'perm_none',
        'get_org_perm_for_apikey test - no rights'
    );

-- Test upload user get_org_perm_for_apikey
SELECT
    is (
        get_org_perm_for_apikey (
            'ac4d9a98-ec25-4af8-933c-2aae4aa52b85',
            'com.demo.app'
        ),
        'perm_upload',
        'get_org_perm_for_apikey test - has upload right'
    );

DELETE FROM org_users
WHERE
    user_id = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
    AND org_id = '046a36ac-e03c-4590-9257-bd6c9dba9ee8';

SELECT
    is (
        get_org_perm_for_apikey (
            'ac4d9a98-ec25-4af8-933c-2aae4aa52b85',
            'com.demo.app'
        ),
        'perm_none',
        'get_org_perm_for_apikey test - no upload right'
    );

SELECT
    *
FROM
    finish ();

ROLLBACK;
