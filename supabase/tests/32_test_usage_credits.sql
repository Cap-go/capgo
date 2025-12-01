BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan (18);

DO $$
BEGIN
  PERFORM tests.create_supabase_user('usage_credits_user', 'credits-test@example.com', '555-555-5555');
END;
$$ LANGUAGE plpgsql;

SELECT
    ok(
        pg_get_functiondef(
            'apply_usage_overage(uuid, public.credit_metric_type, numeric, timestamptz, timestamptz, jsonb)'::regprocedure
        ) IS NOT NULL,
        'apply_usage_overage function exists'
    );

SELECT
    ok(
        pg_get_functiondef(
            'calculate_credit_cost(public.credit_metric_type, numeric)'::regprocedure
        ) IS NOT NULL,
        'calculate_credit_cost function exists'
    );

SELECT
  ok (
    pg_get_functiondef('expire_usage_credits()'::regprocedure) IS NOT NULL,
    'expire_usage_credits function exists'
  );

SELECT
  ok (
    position('t.source_ref' in pg_get_functiondef('top_up_usage_credits(uuid, numeric, timestamptz, text, jsonb, text)'::regprocedure)) > 0,
    'top_up_usage_credits qualifies source_ref lookups to avoid ambiguity'
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
    'manual'
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
    unit_factor,
    org_id
  )
  VALUES (
    'mau',
    0,
    1000000,
    0.1,
    1,
    NULL
  )
  RETURNING id
)
INSERT INTO
test_credit_context (org_id, grant_id, credit_step_id)
SELECT
    grant_insert.org_id,
    grant_insert.id,
    step_insert.id
FROM
    grant_insert,
    step_insert;

SELECT
  throws_ok(
    $sql$
      INSERT INTO public.usage_credit_grants (
        org_id,
        credits_total,
        credits_consumed,
        granted_at,
        expires_at,
        source
      )
      VALUES (
        (SELECT org_id FROM test_credit_context LIMIT 1),
        5,
        0,
        now(),
        now() + interval '1 day',
        'invalid_source'
      )
    $sql$,
    'new row for relation "usage_credit_grants" violates check constraint "usage_credit_grants_source_check"',
    'usage_credit_grants.source enforces allowed values'
  );

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
    'apply_usage_overage is idempotent for the same overage snapshot'
  );

SELECT
    is(
        (
            SELECT credits_consumed
            FROM
                public.usage_credit_grants
            WHERE
                id = (
                    SELECT grant_id
                    FROM
                        test_credit_context
                )
        ),
        1::numeric,
        'usage_credit_grants updated with consumed credits'
    );

UPDATE public.usage_credit_grants
SET
    expires_at = now() - interval '1 day'
WHERE
    id = (
        SELECT grant_id
        FROM
            test_credit_context
    );

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
            FROM
                public.usage_credit_grants
            WHERE
                id = (
                    SELECT grant_id
                    FROM
                        test_credit_context
                )
        ),
        20::numeric,
        'expire_usage_credits consumes remaining credits'
    );

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description,
  source_ref
)
SELECT
  org_id,
  grant_id,
  'purchase',
  5,
  5,
  'Idempotency test transaction',
  jsonb_build_object('sessionId', 'cs_test_idempotent', 'paymentIntentId', 'pi_test_idempotent')
FROM test_credit_context
LIMIT 1;

SELECT
  ok(
    EXISTS(
      SELECT 1
      FROM public.usage_credit_transactions
      WHERE org_id = (SELECT org_id FROM test_credit_context)
        AND transaction_type = 'purchase'
        AND (
          source_ref ->> 'sessionId' = 'cs_test_idempotent'
          OR source_ref ->> 'paymentIntentId' = 'pi_test_idempotent'
        )
    ),
    'credit top-up queries can locate existing purchases by session or payment intent reference'
  );

CREATE TEMP TABLE test_top_up_concurrency_results (
  run_label text,
  grant_id uuid,
  transaction_id bigint,
  available_credits numeric,
  total_credits numeric,
  next_expiration timestamptz
) ON COMMIT DROP;

INSERT INTO test_top_up_concurrency_results
SELECT
  'first',
  *
FROM public.top_up_usage_credits(
  (SELECT org_id FROM test_credit_context),
  5,
  NULL,
  'stripe_top_up',
  jsonb_build_object(
    'sessionId', 'cs_concurrent_top_up',
    'paymentIntentId', 'pi_concurrent_top_up'
  ),
  'concurrent top-up attempt'
);

INSERT INTO test_top_up_concurrency_results
SELECT
  'second',
  *
FROM public.top_up_usage_credits(
  (SELECT org_id FROM test_credit_context),
  5,
  NULL,
  'stripe_top_up',
  jsonb_build_object(
    'sessionId', 'cs_concurrent_top_up',
    'paymentIntentId', 'pi_concurrent_top_up'
  ),
  'concurrent top-up duplicate'
);

SELECT
  is(
    (SELECT transaction_id FROM test_top_up_concurrency_results WHERE run_label = 'first'),
    (SELECT transaction_id FROM test_top_up_concurrency_results WHERE run_label = 'second'),
    'duplicate top-up RPC calls return the same transaction id'
  );

SELECT
  is(
    (SELECT grant_id FROM test_top_up_concurrency_results WHERE run_label = 'first'),
    (SELECT grant_id FROM test_top_up_concurrency_results WHERE run_label = 'second'),
    'duplicate top-up RPC calls return the same grant id'
  );

SELECT
  is(
    (
      SELECT COUNT(*)
      FROM public.usage_credit_transactions
      WHERE org_id = (SELECT org_id FROM test_credit_context)
        AND transaction_type = 'purchase'
        AND source_ref ->> 'sessionId' = 'cs_concurrent_top_up'
    ),
    1::bigint,
    'duplicate top-up RPC calls result in a single purchase transaction row'
  );

SELECT
    ok(
        EXISTS (
            SELECT 1
            FROM
                public.usage_credit_transactions
            WHERE
                grant_id = (
                    SELECT grant_id
                    FROM
                        test_credit_context
                )
                AND transaction_type = 'expiry'
        ),
        'expiry transaction recorded'
    );

CREATE TEMP TABLE test_usage_ledger_context (
  org_id uuid
) ON COMMIT DROP;

-- usage_credit_ledger view aggregates deductions per overage event
WITH setup AS (
  INSERT INTO test_usage_ledger_context (org_id)
  VALUES (gen_random_uuid())
  RETURNING org_id
),
grant_one AS (
  INSERT INTO public.usage_credit_grants (
    org_id,
    credits_total,
    credits_consumed,
    granted_at,
    expires_at,
    source
  )
  SELECT
    org_id,
    50,
    0,
    now(),
    now() + interval '1 year',
    'manual'
  FROM setup
  RETURNING id,
    org_id
),
grant_two AS (
  INSERT INTO public.usage_credit_grants (
    org_id,
    credits_total,
    credits_consumed,
    granted_at,
    expires_at,
    source
  )
  SELECT
    org_id,
    25,
    0,
    now(),
    now() + interval '1 year',
    'manual'
  FROM setup
  RETURNING id,
    org_id
),
overage AS (
  INSERT INTO public.usage_overage_events (
    org_id,
    metric,
    overage_amount,
    credits_estimated,
    credits_debited,
    billing_cycle_start,
    billing_cycle_end,
    details
  )
  SELECT
    org_id,
    'mau',
    1000,
    10,
    10,
    current_date - interval '1 month',
    current_date,
    jsonb_build_object('note', 'ledger view test overage')
  FROM setup
  RETURNING id,
    org_id
),
consumptions AS (
  INSERT INTO public.usage_credit_consumptions (
    grant_id,
    org_id,
    overage_event_id,
    metric,
    credits_used,
    applied_at
  )
  SELECT
    g.id,
    g.org_id,
    o.id,
    'mau',
    6,
    now()
  FROM grant_one g,
    overage o
  UNION ALL
  SELECT
    g.id,
    g.org_id,
    o.id,
    'mau',
    4,
    now()
  FROM grant_two g,
    overage o
),
deductions AS (
  INSERT INTO public.usage_credit_transactions (
    org_id,
    grant_id,
    transaction_type,
    amount,
    balance_after,
    occurred_at,
    description,
    source_ref
  )
  SELECT
    o.org_id,
    g.id,
    'deduction',
    -6,
    94,
    now() - interval '2 minutes',
    'Overage deduction portion 1',
    jsonb_build_object('overage_event_id', o.id, 'metric', 'mau')
  FROM overage o,
    grant_one g
  UNION ALL
  SELECT
    o.org_id,
    g.id,
    'deduction',
    -4,
    90,
    now() - interval '1 minute',
    'Overage deduction portion 2',
    jsonb_build_object('overage_event_id', o.id, 'metric', 'mau')
  FROM overage o,
    grant_two g
)
SELECT 1;

SELECT
  is(
    (
      SELECT COUNT(*)
      FROM public.usage_credit_ledger
      WHERE org_id = (SELECT org_id FROM test_usage_ledger_context)
        AND transaction_type = 'deduction'
    ),
    1::bigint,
    'usage_credit_ledger collapses multiple grant deductions for the same overage event into one row'
  );

SELECT
  is(
    (
      SELECT amount
      FROM public.usage_credit_ledger
      WHERE org_id = (SELECT org_id FROM test_usage_ledger_context)
        AND transaction_type = 'deduction'
    ),
    -10::numeric,
    'usage_credit_ledger aggregates deduction amounts by overage event'
  );

SELECT *
FROM
    finish();

ROLLBACK;
