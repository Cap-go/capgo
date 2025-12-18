BEGIN;


SELECT plan(3);

-- Test is_org_yearly
SELECT
    is(
        is_org_yearly('22dbad8a-b885-4309-9b3b-a09f8460fb6d'),
        FALSE,
        'is_org_yearly test - org is not yearly'
    );

-- Test is_paying_and_good_plan_org_action (based on seed data, org has good plan)
SELECT
    is(
        is_paying_and_good_plan_org_action(
            '22dbad8a-b885-4309-9b3b-a09f8460fb6d', '{mau}'
        ),
        TRUE,
        'is_paying_and_good_plan_org_action test - org has good plan for mau action'
    );

-- Test check_min_rights (overloaded version with user_id)
SELECT
    is(
        check_min_rights(
            'read',
            '6aa76066-55ef-4238-ade6-0b32334a4097',
            '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
            'com.demo.app',
            NULL
        ),
        TRUE,
        'check_min_rights test - user has read rights'
    );

SELECT *
FROM
    finish();

ROLLBACK;
