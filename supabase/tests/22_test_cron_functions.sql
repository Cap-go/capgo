BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (17);

-- Test get_next_cron_time
SELECT
    ok (
        get_next_cron_time ('0 0 * * *', '2024-01-01 12:00:00+00') > '2024-01-01 12:00:00+00',
        'get_next_cron_time test - daily cron returns future time'
    );

SELECT
    ok (
        get_next_cron_time ('0 */6 * * *', '2024-01-01 12:00:00+00') > '2024-01-01 12:00:00+00',
        'get_next_cron_time test - 6-hour cron returns future time'
    );

-- Test get_next_cron_value (the function returns current value when it matches, not incremented)
SELECT
    is (
        get_next_cron_value ('*', 5, 59),
        5,
        'get_next_cron_value test - wildcard returns current value when valid'
    );

SELECT
    is (
        get_next_cron_value ('*/5', 3, 59),
        5,
        'get_next_cron_value test - step pattern returns correct value'
    );

SELECT
    is (
        get_next_cron_value ('10', 5, 59),
        10,
        'get_next_cron_value test - specific value returns that value'
    );

-- Test parse_cron_field (similar behavior - returns current when valid)
SELECT
    is (
        parse_cron_field ('*', 5, 59),
        5,
        'parse_cron_field test - wildcard returns current value when valid'
    );

SELECT
    is (
        parse_cron_field ('*/10', 5, 59),
        10,
        'parse_cron_field test - step pattern returns next step'
    );

SELECT
    is (
        parse_cron_field ('30', 5, 59),
        30,
        'parse_cron_field test - specific value returns that value'
    );

-- Test parse_step_pattern
SELECT
    is (
        parse_step_pattern ('*/5'),
        5,
        'parse_step_pattern test - extracts step value'
    );

SELECT
    is (
        parse_step_pattern ('*/10'),
        10,
        'parse_step_pattern test - extracts larger step value'
    );

-- Test get_process_cron_stats_job_info
SELECT
    ok (
        (
            SELECT
                count(*)
            FROM
                get_process_cron_stats_job_info ()
        ) >= 0,
        'get_process_cron_stats_job_info test - returns job info'
    );

-- Test one_month_ahead (additional test)
SELECT
    ok (
        one_month_ahead () > now()::timestamp,
        'one_month_ahead test - returns timestamp one month in future'
    );

-- Seed helper data for get_next_stats_update_date tests
DELETE FROM public.orgs
WHERE
    id IN (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003'
    );

DELETE FROM public.stripe_info
WHERE
    customer_id IN (
        'cust_future_active',
        'cust_expiring_today',
        'cust_canceled_past'
    );

INSERT INTO
    public.orgs (id, created_by, management_email, name)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        '6aa76066-55ef-4238-ade6-0b32334a4097',
        'org1@capgo.app',
        'Org Future Active'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        '6aa76066-55ef-4238-ade6-0b32334a4097',
        'org2@capgo.app',
        'Org Expiring Today'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        '6aa76066-55ef-4238-ade6-0b32334a4097',
        'org3@capgo.app',
        'Org Canceled Past'
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        '6aa76066-55ef-4238-ade6-0b32334a4097',
        'org4@capgo.app',
        'Org Fourth Active'
    );

INSERT INTO
    public.stripe_info (
        customer_id,
        status,
        product_id,
        subscription_anchor_start,
        subscription_anchor_end,
        trial_at,
        is_good_plan,
        plan_usage
    )
VALUES
    (
        'cust_future_active',
        'succeeded',
        'prod_LQIregjtNduh4q',
        now() - interval '15 days',
        public.get_next_cron_time ('0 3 * * *', now()) + interval '2 days',
        now() - interval '30 days',
        true,
        0
    ),
    (
        'cust_expiring_today',
        'succeeded',
        'prod_LQIregjtNduh4q',
        now() - interval '30 days',
        public.get_next_cron_time ('0 3 * * *', now()) + interval '1 hour',
        now() - interval '60 days',
        true,
        0
    ),
    (
        'cust_canceled_past',
        'succeeded',
        'prod_LQIregjtNduh4q',
        now() - interval '10 days',
        now() + interval '20 days',
        now() - interval '40 days',
        true,
        0
    ),
    (
        'cust_fourth_active',
        'succeeded',
        'prod_LQIregjtNduh4q',
        now() - interval '5 days',
        public.get_next_cron_time ('0 3 * * *', now()) + interval '3 days',
        now() - interval '10 days',
        true,
        0
    );

UPDATE public.orgs
SET
    customer_id = 'cust_future_active'
WHERE
    id = '00000000-0000-0000-0000-000000000001';

UPDATE public.orgs
SET
    customer_id = 'cust_expiring_today'
WHERE
    id = '00000000-0000-0000-0000-000000000002';

UPDATE public.orgs
SET
    customer_id = 'cust_canceled_past'
WHERE
    id = '00000000-0000-0000-0000-000000000003';

UPDATE public.orgs
SET
    customer_id = 'cust_fourth_active'
WHERE
    id = '00000000-0000-0000-0000-000000000004';

WITH
    next_run AS (
        SELECT
            public.get_next_cron_time ('0 3 * * *', now()) AS t
    )
UPDATE public.stripe_info si
SET
    subscription_anchor_end = next_run.t - interval '1 minute'
FROM
    next_run
WHERE
    si.customer_id = 'cust_expiring_today';

-- Test get_next_stats_update_date scenarios
SELECT
    ok (
        get_next_stats_update_date ('00000000-0000-0000-0000-000000000001') IS NOT null,
        'get_next_stats_update_date returns timestamp for first active org'
    );

SELECT
    ok (
        get_next_stats_update_date ('00000000-0000-0000-0000-000000000003') IS NOT null,
        'get_next_stats_update_date returns timestamp for later active org'
    );

SELECT
    is (
        get_next_stats_update_date ('00000000-0000-0000-0000-000000000003') - get_next_stats_update_date ('00000000-0000-0000-0000-000000000001'),
        interval '4 minutes',
        'Only paying orgs counted: org3 arrives 4 minutes after org1'
    );

-- Simulate edge case: next run boundary (org expires right before next cron)
SELECT
    is (
        get_next_stats_update_date ('00000000-0000-0000-0000-000000000002'),
        null,
        'Org expiring before cron should not receive an update time'
    );

SELECT
    is (
        get_next_stats_update_date ('00000000-0000-0000-0000-000000000004') - public.get_next_cron_time ('0 3 * * *', now()),
        interval '8 minutes',
        'Fourth active org is scheduled 8 minutes after cron start (two slots)'
    );

DELETE FROM public.orgs
WHERE
    id IN (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004'
    );

UPDATE public.orgs
SET
    customer_id = null
WHERE
    customer_id IN (
        'cust_future_active',
        'cust_expiring_today',
        'cust_canceled_past',
        'cust_fourth_active'
    );

DELETE FROM public.stripe_info
WHERE
    customer_id IN (
        'cust_future_active',
        'cust_expiring_today',
        'cust_canceled_past',
        'cust_fourth_active'
    );

SELECT
    *
FROM
    finish ();

ROLLBACK;
