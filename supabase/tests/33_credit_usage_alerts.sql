BEGIN;

SELECT plan(8);

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
    RETURNING
        org_id,
        id
)

INSERT INTO credit_alert_context (org_id, base_grant_id)
SELECT
    org_id,
    id
FROM grant_insert;

DELETE FROM pgmq.q_credit_usage_alerts
WHERE
    (message -> 'payload' ->> 'org_id')::uuid = (SELECT org_id FROM credit_alert_context LIMIT 1);

SELECT
    ok(
        pg_get_functiondef(
            'enqueue_credit_usage_alert()'::regprocedure
        ) IS NOT NULL,
        'enqueue_credit_usage_alert trigger function exists'
    );

-- First cycle: cross 50/75/90/100%
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
    'deduction'::public.credit_transaction_type,
    -60,
    40,
    'credit alert 60% usage'
FROM credit_alert_context;

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
    'deduction'::public.credit_transaction_type,
    -20,
    20,
    'credit alert 80% usage'
FROM credit_alert_context;

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
    'deduction'::public.credit_transaction_type,
    -15,
    5,
    'credit alert 95% usage'
FROM credit_alert_context;

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
    'deduction'::public.credit_transaction_type,
    -5,
    0,
    'credit alert 100% usage'
FROM credit_alert_context;

SELECT
    is(
        (
            SELECT count(*)
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
        ),
        4::bigint,
        'First cycle enqueues alerts at 50/75/90/100 percent'
    );

SELECT
    is(
        (
            SELECT array_agg((message -> 'payload' ->> 'threshold')::int ORDER BY msg_id)
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
        ),
        ARRAY[50, 75, 90, 100]::int [],
        'First cycle payload thresholds ordered as expected'
    );

-- Top-up grant resets available credits and allows alerts to re-fire
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
        'purchase'::public.credit_transaction_type,
        50,
        50,
        'top-up purchase'
    FROM credit_alert_context,
        top_up
    RETURNING grant_id
)

UPDATE credit_alert_context
SET top_up_grant_id = top_up.id
FROM top_up, purchase_tx;

-- Align grant consumption with the post-top-up state before triggering the next alert
UPDATE public.usage_credit_grants
SET credits_consumed = credits_total
WHERE id = (SELECT base_grant_id FROM credit_alert_context);

UPDATE public.usage_credit_grants
SET credits_consumed = 30
WHERE id = (SELECT top_up_grant_id FROM credit_alert_context);

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
    'deduction'::public.credit_transaction_type,
    -30,
    20,
    'credit alert cycle 2 at 75%'
FROM credit_alert_context;

SELECT
    is(
        (
            SELECT count(*)
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
        ),
        5::bigint,
        'Top-up enables a new alert when usage crosses 75 percent again'
    );

SELECT
    is(
        (
            SELECT (message -> 'payload' ->> 'threshold')::int
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
            ORDER BY msg_id DESC
            LIMIT 1
        ),
        75,
        'Second cycle starts at the 75 percent threshold'
    );

SELECT
    is(
        (
            SELECT (message -> 'payload' ->> 'total_credits')::numeric
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
            ORDER BY msg_id DESC
            LIMIT 1
        ),
        150::numeric,
        'Alert payload reflects updated total credits after top-up'
    );

SELECT
    is(
        (
            SELECT (message -> 'payload' ->> 'alert_cycle')::int
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
            ORDER BY msg_id DESC
            LIMIT 1
        ),
        (
            SELECT (date_part('year', now())::int * 100) + date_part('month', now())::int
        ),
        'Alert cycle uses the current YYYYMM key'
    );

SELECT
    is(
        (
            SELECT (message -> 'payload' ->> 'org_id')::uuid
            FROM pgmq.q_credit_usage_alerts
            WHERE
                (message -> 'payload' ->> 'org_id')::uuid
                = (SELECT org_id FROM credit_alert_context)
            ORDER BY msg_id DESC
            LIMIT 1
        ),
        (SELECT org_id FROM credit_alert_context),
        'Alert payload includes the originating org id'
    );

SELECT * FROM finish();

ROLLBACK;
