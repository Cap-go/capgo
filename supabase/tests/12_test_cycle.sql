-- 08_plan_functions.sql
BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

-- + 2 is for the count(*)
-- -1 is for the pay as you go if statenent
SELECT
  plan (18);

CREATE OR REPLACE FUNCTION my_tests () RETURNS SETOF TEXT AS $$
DECLARE
  cycle_start timestamp with time zone;
  cycle_end timestamp with time zone;
BEGIN

  SELECT subscription_anchor_start, subscription_anchor_end 
  INTO cycle_start, cycle_end
  FROM get_cycle_info_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8');

  RETURN NEXT ok(cycle_start IS DISTINCT FROM NULL, 'Has cycle start');
  RETURN NEXT ok(cycle_end IS DISTINCT FROM NULL, 'Has cycle end');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '>', '27 days', 'Interval (base) greater than 27 days');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '<', '32 days', 'Interval (base) less than 32 days');

  -- Let's now set the cycle to one year to see if it still works
  update stripe_info 
  set subscription_anchor_end=now() + interval '15 days' + interval '11 months', 
  subscription_anchor_start=now() - interval '15 days' 
  where customer_id='cus_Q38uE91NP8Ufqc';

  SELECT subscription_anchor_start, subscription_anchor_end 
  INTO cycle_start, cycle_end
  FROM get_cycle_info_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8');

  RETURN NEXT ok(cycle_start IS DISTINCT FROM NULL, 'Has cycle start');
  RETURN NEXT ok(cycle_end IS DISTINCT FROM NULL, 'Has cycle end');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '>', '27 days', 'Interval (base) greater than 27 days');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '<', '32 days', 'Interval (base) less than 32 days');

  -- Let's now set the cycle to 2 months in the past to see if it still works
  update stripe_info 
  set subscription_anchor_end=now() + interval '15 days' - interval '2 months', 
  subscription_anchor_start=now() - interval '15 days' - interval '2 months' 
  where customer_id='cus_Q38uE91NP8Ufqc';

  SELECT subscription_anchor_start, subscription_anchor_end 
  INTO cycle_start, cycle_end
  FROM get_cycle_info_org('046a36ac-e03c-4590-9257-bd6c9dba9ee8');

  -- RAISE NOTICE 'Cycle Start: %, Cycle End: % Now: %', cycle_start, cycle_end, now();
  RETURN NEXT ok(cycle_start IS DISTINCT FROM NULL, 'Has cycle start');
  RETURN NEXT ok(cycle_end IS DISTINCT FROM NULL, 'Has cycle end');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '>', '27 days', 'Interval (base) greater than 27 days');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '<', '32 days', 'Interval (base) less than 32 days');
  RETURN NEXT ok(cycle_start > (now() - interval '3 months') AND cycle_start < now(), 'Start date is within the last 3 months and before now');
  RETURN NEXT ok(cycle_end > (now() + interval '1 days'), 'End date is at least one day later than now');

  -- Let's not destory the org customer_id so that we can see if get cycle will work even when no data is available
  UPDATE orgs
  set customer_id=NULL
  where id='046a36ac-e03c-4590-9257-bd6c9dba9ee8';

  RETURN NEXT ok(cycle_start IS DISTINCT FROM NULL, 'Has cycle start');
  RETURN NEXT ok(cycle_end IS DISTINCT FROM NULL, 'Has cycle end');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '>', '27 days', 'Interval (base) greater than 27 days');
  RETURN NEXT cmp_ok(cycle_end - cycle_start, '<', '32 days', 'Interval (base) less than 32 days');
END;
$$ LANGUAGE plpgsql;

SELECT
  my_tests ();

SELECT
  *
FROM
  finish ();

ROLLBACK;
