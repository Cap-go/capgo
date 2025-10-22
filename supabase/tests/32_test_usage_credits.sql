BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (8);

DO $$
BEGIN
  PERFORM tests.create_supabase_user('usage_credits_user', 'credits-test@example.com', '555-555-5555');
END;
$$ LANGUAGE plpgsql;

SELECT
  ok(
    pg_get_functiondef('apply_usage_overage(uuid, public.credit_metric_type, numeric, timestamptz, timestamptz, jsonb)'::regprocedure) IS NOT NULL,
    'apply_usage_overage function exists'
  );

SELECT
  ok(
    pg_get_functiondef('calculate_credit_cost(public.credit_metric_type, numeric)'::regprocedure) IS NOT NULL,
    'calculate_credit_cost function exists'
  );

SELECT
  ok(
    pg_get_functiondef('expire_usage_credits()'::regprocedure) IS NOT NULL,
    'expire_usage_credits function exists'
  );

CREATE TEMP TABLE test_credit_context (
  org_id uuid,
  grant_id uuid,
  credit_step_id bigint
) ON COMMIT DROP;

DELETE FROM public.capgo_credits_steps WHERE type = 'mau';
DELETE FROM public.stripe_info WHERE customer_id = 'cus_test_credits';

WITH plan_selection AS (
  SELECT id,
    stripe_id
  FROM public.plans
  ORDER BY created_at
  LIMIT 1
),
user_insert AS (
  INSERT INTO public.users (id, email, created_at, updated_at)
  SELECT
    tests.get_supabase_uid('usage_credits_user'),
    'credits-test@example.com',
    now(),
    now()
  RETURNING id
),
stripe_info_insert AS (
  INSERT INTO public.stripe_info (customer_id, product_id, status)
  SELECT
    'cus_test_credits',
    plan_selection.stripe_id,
    'succeeded'
  FROM plan_selection
  RETURNING customer_id
),
org_insert AS (
  INSERT INTO public.orgs (
    id,
    created_by,
    name,
    management_email,
    customer_id
  )
  SELECT
    gen_random_uuid(),
    user_insert.id,
    'Credits Test Org',
    'credits-test@example.com',
    stripe_info_insert.customer_id
  FROM user_insert,
    stripe_info_insert
  RETURNING id
),
grant_insert AS (
  INSERT INTO public.usage_credit_grants (
    org_id,
    credits_total,
    credits_consumed,
    granted_at,
    expires_at,
    source
  )
  SELECT
    org_insert.id,
    20,
    0,
    now(),
    now() + interval '1 year',
    'test'
  FROM org_insert
  RETURNING id,
    org_id
),
step_insert AS (
  INSERT INTO public.capgo_credits_steps (
    type,
    step_min,
    step_max,
    price_per_unit,
    unit_factor
  )
  VALUES (
    'mau',
    0,
    1000000,
    0.1,
    1
  )
  RETURNING id
)
INSERT INTO test_credit_context (org_id, grant_id, credit_step_id)
SELECT
  grant_insert.org_id,
  grant_insert.id,
  step_insert.id
FROM grant_insert, step_insert;

SELECT
  is(
    (
      SELECT overage_unpaid
      FROM public.apply_usage_overage(
        (SELECT org_id FROM test_credit_context),
        'mau',
        10,
        now(),
        now() + interval '1 month',
        '{}'::jsonb
      )
    ),
    0::numeric,
    'apply_usage_overage consumes credits when available'
  );

SELECT
  is(
    (
      SELECT credits_consumed
      FROM public.usage_credit_grants
      WHERE id = (SELECT grant_id FROM test_credit_context)
    ),
    1::numeric,
    'usage_credit_grants updated with consumed credits'
  );

UPDATE public.usage_credit_grants
SET expires_at = now() - interval '1 day'
WHERE id = (SELECT grant_id FROM test_credit_context);

SELECT
  is(
    public.expire_usage_credits(),
    1::bigint,
    'expire_usage_credits processes expired grants'
  );

SELECT
  is(
    (
      SELECT credits_consumed
      FROM public.usage_credit_grants
      WHERE id = (SELECT grant_id FROM test_credit_context)
    ),
    20::numeric,
    'expire_usage_credits consumes remaining credits'
  );

SELECT
  ok(
    EXISTS(
      SELECT 1
      FROM public.usage_credit_transactions
      WHERE grant_id = (SELECT grant_id FROM test_credit_context)
        AND transaction_type = 'expiry'
    ),
    'expiry transaction recorded'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
