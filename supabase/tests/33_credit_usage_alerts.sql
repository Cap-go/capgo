BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
  plan(13);

DO $$
BEGIN
  PERFORM tests.create_supabase_user('credit_alert_user', 'credit-alert@example.com', '555-123-4567');
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE credit_alert_context (
  org_id uuid,
  base_grant_id uuid,
  top_up_grant_id uuid
) ON COMMIT DROP;

WITH user_insert AS (
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    tests.get_supabase_uid('credit_alert_user'),
    'credit-alert@example.com',
    now(),
    now()
  )
  RETURNING id
),
org_insert AS (
  INSERT INTO public.orgs (id, created_by, name, management_email)
  SELECT
    gen_random_uuid(),
    user_insert.id,
    'Credit Alert Org',
    'credit-alert@example.com'
  FROM user_insert
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
    100,
    0,
    now(),
    now() + interval '1 year',
    'manual'
  FROM org_insert
  RETURNING org_id,
    id
)
INSERT INTO credit_alert_context (org_id, base_grant_id)
SELECT org_id, id FROM grant_insert;

SELECT
  ok(
    pg_get_functiondef('handle_usage_credit_alerts()'::regprocedure) IS NOT NULL,
    'handle_usage_credit_alerts function exists'
  );

-- 60% usage should trigger the 50% alert
UPDATE public.usage_credit_grants
SET credits_consumed = 60
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description
)
SELECT
  org_id,
  base_grant_id,
  'deduction',
  -60,
  40,
  'credit alert 60% usage'
FROM credit_alert_context;

SELECT
  is(
    (SELECT count(*) FROM pgmq.q_credit_usage_alerts),
    1::bigint,
    'First consumption enqueues one alert'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'threshold')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    50,
    'First alert targets 50% threshold'
  );

-- 80% usage should trigger the 75% alert
UPDATE public.usage_credit_grants
SET credits_consumed = 80
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description
)
SELECT
  org_id,
  base_grant_id,
  'deduction',
  -20,
  20,
  'credit alert 80% usage'
FROM credit_alert_context;

SELECT
  is(
    (SELECT count(*) FROM pgmq.q_credit_usage_alerts),
    2::bigint,
    'Second consumption enqueues a new alert'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'threshold')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    75,
    'Second alert targets 75% threshold'
  );

-- 95% usage should trigger the 90% alert
UPDATE public.usage_credit_grants
SET credits_consumed = 95
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description
)
SELECT
  org_id,
  base_grant_id,
  'deduction',
  -15,
  5,
  'credit alert 95% usage'
FROM credit_alert_context;

SELECT
  is(
    (SELECT count(*) FROM pgmq.q_credit_usage_alerts),
    3::bigint,
    'Third consumption enqueues a new alert'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'threshold')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    90,
    'Third alert targets 90% threshold'
  );

-- 100% usage should trigger the 100% alert
UPDATE public.usage_credit_grants
SET credits_consumed = 100
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description
)
SELECT
  org_id,
  base_grant_id,
  'deduction',
  -5,
  0,
  'credit alert 100% usage'
FROM credit_alert_context;

SELECT
  is(
    (SELECT count(*) FROM pgmq.q_credit_usage_alerts),
    4::bigint,
    'Fourth consumption enqueues the 100% alert'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'threshold')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    100,
    'Fourth alert targets 100% threshold'
  );

-- Top up with new credits and verify the alert cycle resets
WITH top_up AS (
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
  FROM credit_alert_context
  RETURNING id
),
purchase_tx AS (
  INSERT INTO public.usage_credit_transactions (
    org_id,
    grant_id,
    transaction_type,
    amount,
    balance_after,
    description
  )
  SELECT
    org_id,
    top_up.id,
    'purchase',
    50,
    50,
    'top-up purchase'
  FROM credit_alert_context,
    top_up
  RETURNING grant_id
)
UPDATE credit_alert_context
SET top_up_grant_id = grant_id
FROM purchase_tx;

SELECT
  is(
    (
      SELECT last_threshold
      FROM public.usage_credit_alert_state
      WHERE org_id = (SELECT org_id FROM credit_alert_context)
    ),
    0,
    'Top-up resets stored threshold'
  );

-- After top-up, another deduction should start a new cycle at the next threshold reached (75%)
UPDATE public.usage_credit_grants
SET credits_consumed = 130
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

INSERT INTO public.usage_credit_transactions (
  org_id,
  grant_id,
  transaction_type,
  amount,
  balance_after,
  description
)
SELECT
  org_id,
  base_grant_id,
  'deduction',
  -30,
  20,
  'credit alert cycle 2 at 75%'
FROM credit_alert_context;

SELECT
  is(
    (SELECT count(*) FROM pgmq.q_credit_usage_alerts),
    5::bigint,
    'Second cycle enqueues a new alert'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'threshold')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    75,
    'Second cycle starts at 75% threshold'
  );

SELECT
  is(
    (
      SELECT (message -> 'payload' ->> 'alert_cycle')::int
      FROM pgmq.q_credit_usage_alerts
      ORDER BY msg_id DESC
      LIMIT 1
    ),
    2,
    'Alert cycle increments after a top-up'
  );

SELECT * FROM finish();

ROLLBACK;
