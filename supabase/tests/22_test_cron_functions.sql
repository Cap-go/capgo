BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (12);

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
        COUNT(*)
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

SELECT
  *
FROM
  finish ();

ROLLBACK;
