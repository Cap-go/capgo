-- begin the transaction, this will allow you to rollback any changes made during the test
BEGIN;

-- plan your test in advance, this ensures the proper number of tests have been run.
select plan(1);

-- run your test

select ok(true, 'test passed');

-- check the results of your test
select * from finish();

-- rollback the transaction, completing the test scenario
ROLLBACK;
