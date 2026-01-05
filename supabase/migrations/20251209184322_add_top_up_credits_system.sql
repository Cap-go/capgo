BEGIN;

ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS credit_id text;

UPDATE public.plans
SET credit_id = 'prod_TJRd2hFHZsBIPK'
WHERE credit_id IS NULL;

ALTER TABLE public.plans
ALTER COLUMN credit_id SET NOT NULL;

COMMENT ON COLUMN public.plans.credit_id IS 'Stripe product identifier used for purchasing additional credits.';

DROP TABLE IF EXISTS public.capgo_credit_products;

DO $$
DECLARE
    allowed_sources CONSTANT text[] := ARRAY['manual', 'stripe_top_up'];
    fallback_source CONSTANT text := allowed_sources[1];
    constraint_name CONSTANT text := 'usage_credit_grants_source_check';
    constraint_exists boolean;
BEGIN
    UPDATE public.usage_credit_grants
    SET source = fallback_source
    WHERE source IS NULL OR NOT (source = ANY (allowed_sources));

    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = constraint_name
          AND c.conrelid = 'public.usage_credit_grants'::regclass
    ) INTO constraint_exists;

    IF NOT constraint_exists THEN
        EXECUTE format(
            'ALTER TABLE public.usage_credit_grants
             ADD CONSTRAINT %I CHECK (source = ANY (%L::text[]))',
            constraint_name,
            allowed_sources
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.top_up_usage_credits(
    p_org_id uuid,
    p_amount numeric,
    p_expires_at timestamptz DEFAULT NULL,
    p_source text DEFAULT 'manual',
    p_source_ref jsonb DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS TABLE (
    grant_id uuid,
    transaction_id bigint,
    available_credits numeric,
    total_credits numeric,
    next_expiration timestamptz
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  c_empty CONSTANT text := '';
  c_service_role CONSTANT text := 'service_role';
  c_default_source CONSTANT text := 'manual';
  c_purchase CONSTANT public.credit_transaction_type := 'purchase'::public.credit_transaction_type;
  c_session_id_key CONSTANT text := 'sessionId';
  c_payment_intent_key CONSTANT text := 'paymentIntentId';
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_expires timestamptz := COALESCE(p_expires_at, NOW() + interval '1 year');
  v_source_ref jsonb := p_source_ref;
  v_session_id text := NULLIF(v_source_ref ->> c_session_id_key, c_empty);
  v_payment_intent_id text := NULLIF(v_source_ref ->> c_payment_intent_key, c_empty);
  v_grant_id uuid;
  v_transaction_id bigint;
  v_available numeric := 0;
  v_total numeric := 0;
  v_next_expiration timestamptz;
  v_existing_transaction_id bigint;
  v_existing_grant_id uuid;
BEGIN
  IF current_user <> 'postgres' AND COALESCE(v_request_role, c_empty) <> c_service_role THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Guard the grant/transaction creation inside a subtransaction so we can detect
  -- race-condition duplicates via the new unique indexes and return the existing
  -- ledger row instead of creating another grant.
  BEGIN
    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      p_org_id,
      p_amount,
      0,
      NOW(),
      v_effective_expires,
      COALESCE(NULLIF(p_source, c_empty), c_default_source),
      v_source_ref,
      p_notes
    )
    RETURNING id INTO v_grant_id;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      description,
      source_ref
    )
    VALUES (
      p_org_id,
      v_grant_id,
      c_purchase,
      p_amount,
      v_available,
      p_notes,
      v_source_ref
    )
    RETURNING id INTO v_transaction_id;

  EXCEPTION WHEN unique_violation THEN
    IF v_session_id IS NULL AND v_payment_intent_id IS NULL THEN
      RAISE;
    END IF;

    SELECT t.id, t.grant_id
    INTO v_existing_transaction_id, v_existing_grant_id
    FROM public.usage_credit_transactions AS t
    WHERE t.org_id = p_org_id
      AND t.transaction_type = c_purchase
      AND (
        (v_session_id IS NOT NULL AND t.source_ref ->> c_session_id_key = v_session_id)
        OR (v_payment_intent_id IS NOT NULL AND t.source_ref ->> c_payment_intent_key = v_payment_intent_id)
      )
    ORDER BY t.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    v_grant_id := v_existing_grant_id;
    v_transaction_id := v_existing_transaction_id;
  END;

  grant_id := v_grant_id;
  transaction_id := v_transaction_id;
  available_credits := v_available;
  total_credits := v_total;
  next_expiration := v_next_expiration;

  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.top_up_usage_credits(
    uuid,
    numeric,
    timestamptz,
    text,
    jsonb,
    text
) IS 'Grants credits to an organization, records the transaction ledger entry, and returns the updated balances.';

GRANT EXECUTE ON FUNCTION public.top_up_usage_credits(
    uuid, numeric, timestamptz, text, jsonb, text
) TO service_role;

DO $$
DECLARE
  duplicate_count int;
  purchase_type CONSTANT text := 'purchase';
  session_id_key CONSTANT text := 'sessionId';
  payment_intent_key CONSTANT text := 'paymentIntentId';
  target_schema CONSTANT text := 'public';
  target_table CONSTANT text := 'usage_credit_transactions';
  qualified_table text := format('%I.%I', target_schema, target_table);
  session_idx text := format('%I_purchase_session_id_idx', target_table);
  payment_intent_idx text := format('%I_purchase_payment_intent_id_idx', target_table);
BEGIN
  EXECUTE format(
    'SELECT COUNT(*) FROM (
       SELECT source_ref ->> %L AS session_id
       FROM %s
       WHERE transaction_type = %L
         AND source_ref ->> %L IS NOT NULL
       GROUP BY source_ref ->> %L
       HAVING COUNT(*) > 1
     ) dup',
    session_id_key, qualified_table, purchase_type, session_id_key, session_id_key
  )
  INTO duplicate_count;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate Stripe checkout sessions – clean up the offending % before applying the uniqueness index.', duplicate_count, qualified_table;
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM (
       SELECT source_ref ->> %L AS payment_intent_id
       FROM %s
       WHERE transaction_type = %L
         AND source_ref ->> %L IS NOT NULL
       GROUP BY source_ref ->> %L
       HAVING COUNT(*) > 1
     ) dup',
    payment_intent_key, qualified_table, purchase_type, payment_intent_key, payment_intent_key
  )
  INTO duplicate_count;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate Stripe payment intents – clean up the offending % before applying the uniqueness index.', duplicate_count, qualified_table;
  END IF;

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I
       ON %s ((source_ref ->> %L))
     WHERE transaction_type = %L
       AND source_ref ->> %L IS NOT NULL',
    session_idx, qualified_table, session_id_key, purchase_type, session_id_key
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I
       ON %s ((source_ref ->> %L))
     WHERE transaction_type = %L
       AND source_ref ->> %L IS NOT NULL',
    payment_intent_idx, qualified_table, payment_intent_key, purchase_type, payment_intent_key
  );
END;
$$;

-- Prevent double-charging usage credits when the same overage is processed multiple times in a billing cycle
CREATE OR REPLACE FUNCTION public.apply_usage_overage(
    p_org_id uuid,
    p_metric public.credit_metric_type,
    p_overage_amount numeric,
    p_billing_cycle_start timestamptz,
    p_billing_cycle_end timestamptz,
    p_details jsonb DEFAULT NULL
) RETURNS TABLE (
    overage_amount numeric,
    credits_required numeric,
    credits_applied numeric,
    credits_remaining numeric,
    credit_step_id bigint,
    overage_covered numeric,
    overage_unpaid numeric,
    overage_event_id uuid
) LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_calc RECORD;
  v_event_id uuid;
  v_remaining numeric := 0;
  v_applied numeric := 0;
  v_per_unit numeric := 0;
  v_available numeric;
  v_use numeric;
  v_balance numeric;
  v_overage_paid numeric := 0;
  v_existing_credits numeric := 0;
  v_required numeric := 0;
  v_credits_to_apply numeric := 0;
  grant_rec public.usage_credit_grants%ROWTYPE;
BEGIN
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  SELECT *
  INTO v_calc
  FROM public.calculate_credit_cost(p_metric, p_overage_amount)
  LIMIT 1;

  IF v_calc.credit_step_id IS NULL THEN
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      credit_step_id,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES (
      p_org_id,
      p_metric,
      p_overage_amount,
      0,
      0,
      NULL,
      p_billing_cycle_start,
      p_billing_cycle_end,
      p_details
    )
    RETURNING id INTO v_event_id;

    RETURN QUERY SELECT p_overage_amount, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, p_overage_amount, v_event_id;
    RETURN;
  END IF;

  v_per_unit := v_calc.credit_cost_per_unit;
  v_required := v_calc.credits_required;

  SELECT COALESCE(SUM(credits_debited), 0)
  INTO v_existing_credits
  FROM public.usage_overage_events
  WHERE org_id = p_org_id
    AND metric = p_metric
    AND (billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
    AND (billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date);

  v_credits_to_apply := GREATEST(v_required - v_existing_credits, 0);
  v_remaining := v_credits_to_apply;

  INSERT INTO public.usage_overage_events (
    org_id,
    metric,
    overage_amount,
    credits_estimated,
    credits_debited,
    credit_step_id,
    billing_cycle_start,
    billing_cycle_end,
    details
  )
  VALUES (
    p_org_id,
    p_metric,
    p_overage_amount,
    v_required,
    0,
    v_calc.credit_step_id,
    p_billing_cycle_start,
    p_billing_cycle_end,
    p_details
  )
  RETURNING id INTO v_event_id;

  FOR grant_rec IN
    SELECT *
    FROM public.usage_credit_grants
    WHERE org_id = p_org_id
      AND expires_at >= NOW()
      AND credits_consumed < credits_total
    ORDER BY expires_at ASC, granted_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_available := grant_rec.credits_total - grant_rec.credits_consumed;
    IF v_available <= 0 THEN
      CONTINUE;
    END IF;

    v_use := LEAST(v_available, v_remaining);
    v_remaining := v_remaining - v_use;
    v_applied := v_applied + v_use;

    UPDATE public.usage_credit_grants
    SET credits_consumed = credits_consumed + v_use
    WHERE id = grant_rec.id;

    INSERT INTO public.usage_credit_consumptions (
      grant_id,
      org_id,
      overage_event_id,
      metric,
      credits_used
    )
    VALUES (
      grant_rec.id,
      p_org_id,
      v_event_id,
      p_metric,
      v_use
    );

    SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
    INTO v_balance
    FROM public.usage_credit_grants
    WHERE org_id = p_org_id
      AND expires_at >= NOW();

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
    VALUES (
      p_org_id,
      grant_rec.id,
      'deduction',
      -v_use,
      v_balance,
      NOW(),
      format('Overage deduction for %s usage', p_metric::text),
      jsonb_build_object('overage_event_id', v_event_id, 'metric', p_metric::text)
    );
  END LOOP;

  UPDATE public.usage_overage_events
  SET credits_debited = v_applied
  WHERE id = v_event_id;

  IF v_per_unit > 0 THEN
    v_overage_paid := LEAST(p_overage_amount, (v_applied + v_existing_credits) / v_per_unit);
  ELSE
    v_overage_paid := p_overage_amount;
  END IF;

  RETURN QUERY SELECT
    p_overage_amount,
    v_required,
    v_applied,
    GREATEST(v_required - v_existing_credits - v_applied, 0),
    v_calc.credit_step_id,
    v_overage_paid,
    GREATEST(p_overage_amount - v_overage_paid, 0),
    v_event_id;
END;
$$;

DROP VIEW IF EXISTS public.usage_credit_ledger;

CREATE VIEW public.usage_credit_ledger
WITH (security_invoker = TRUE, security_barrier = TRUE) AS
WITH overage_allocations AS (
    SELECT
        e.id AS overage_event_id,
        e.org_id,
        e.metric,
        e.overage_amount,
        e.credits_estimated,
        e.credits_debited,
        e.billing_cycle_start,
        e.billing_cycle_end,
        e.created_at,
        e.details,
        COALESCE(SUM(c.credits_used), 0) AS credits_applied,
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'grant_id', c.grant_id,
                'credits_used', c.credits_used,
                'grant_source', g.source,
                'grant_expires_at', g.expires_at,
                'grant_notes', g.notes
            )
            ORDER BY g.expires_at, g.granted_at
        ) FILTER (WHERE c.grant_id IS NOT NULL) AS grant_allocations
    FROM public.usage_overage_events AS e
    LEFT JOIN public.usage_credit_consumptions AS c
        ON e.id = c.overage_event_id
    LEFT JOIN public.usage_credit_grants AS g
        ON c.grant_id = g.id
    GROUP BY
        e.id,
        e.org_id,
        e.metric,
        e.overage_amount,
        e.credits_estimated,
        e.credits_debited,
        e.billing_cycle_start,
        e.billing_cycle_end,
        e.created_at,
        e.details
),

aggregated_deductions AS (
    SELECT
        a.org_id,
        'deduction'::public.credit_transaction_type AS transaction_type,
        a.overage_event_id,
        a.metric,
        a.overage_amount,
        a.billing_cycle_start,
        a.billing_cycle_end,
        a.grant_allocations,
        a.details,
        MIN(t.id) AS id,
        SUM(t.amount) AS amount,
        MIN(t.balance_after) AS balance_after,
        MAX(t.occurred_at) AS occurred_at,
        MIN(t.description) AS description_raw,
        COALESCE(
            NULLIF(a.details ->> 'note', ''),
            NULLIF(a.details ->> 'description', ''),
            MIN(t.description),
            FORMAT('Overage %s', a.metric::text)
        ) AS description,
        JSONB_BUILD_OBJECT(
            'overage_event_id', a.overage_event_id,
            'metric', a.metric::text,
            'overage_amount', a.overage_amount,
            'grant_allocations', a.grant_allocations
        ) AS source_ref
    FROM public.usage_credit_transactions AS t
    INNER JOIN overage_allocations AS a
        ON (t.source_ref ->> 'overage_event_id')::uuid = a.overage_event_id
    WHERE
        t.transaction_type = 'deduction'
        AND t.source_ref ? 'overage_event_id'
    GROUP BY
        a.overage_event_id,
        a.metric,
        a.overage_amount,
        a.billing_cycle_start,
        a.billing_cycle_end,
        a.grant_allocations,
        a.details,
        a.org_id
),

other_transactions AS (
    SELECT
        t.id,
        t.org_id,
        t.transaction_type,
        t.amount,
        t.balance_after,
        t.occurred_at,
        t.description,
        t.source_ref,
        NULL::uuid AS overage_event_id,
        NULL::public.credit_metric_type AS metric,
        NULL::numeric AS overage_amount,
        NULL::date AS billing_cycle_start,
        NULL::date AS billing_cycle_end,
        NULL::jsonb AS grant_allocations
    FROM public.usage_credit_transactions AS t
    WHERE
        t.transaction_type <> 'deduction'
        OR t.source_ref IS NULL
        OR NOT (t.source_ref ? 'overage_event_id')
)

SELECT
    id,
    org_id,
    transaction_type,
    amount,
    balance_after,
    occurred_at,
    description,
    source_ref,
    overage_event_id,
    metric,
    overage_amount,
    billing_cycle_start,
    billing_cycle_end,
    grant_allocations,
    NULL::jsonb AS details
FROM aggregated_deductions
UNION ALL
SELECT
    id,
    org_id,
    transaction_type,
    amount,
    balance_after,
    occurred_at,
    description,
    source_ref,
    overage_event_id,
    metric,
    overage_amount,
    billing_cycle_start,
    billing_cycle_end,
    grant_allocations,
    NULL::jsonb AS details
FROM other_transactions;

GRANT SELECT ON public.usage_credit_ledger TO authenticated;
GRANT SELECT ON public.usage_credit_ledger TO service_role;

-- Create queue to deliver credit usage threshold alerts
SELECT pgmq.create('credit_usage_alerts');

-- Enqueue alerts when credit consumption crosses key thresholds
CREATE OR REPLACE FUNCTION public.enqueue_credit_usage_alert() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  v_total numeric := 0;
  v_available numeric := 0;
  v_available_before numeric := 0;
  v_percent_after numeric := 0;
  v_percent_before numeric := 0;
  v_threshold integer;
  v_alert_cycle integer;
  v_occurred_at timestamptz := COALESCE(NEW.occurred_at, NOW());
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW.amount IS NULL OR NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(total_credits, 0),
    COALESCE(available_credits, 0)
  INTO v_total, v_available
  FROM public.usage_credit_balances
  WHERE org_id = NEW.org_id;

  v_available := GREATEST(COALESCE(NEW.balance_after, v_available, 0), 0);

  IF v_total <= 0 THEN
    RETURN NEW;
  END IF;

  v_available_before := GREATEST(v_available - NEW.amount, 0);
  IF v_available_before > v_total THEN
    v_available_before := v_total;
  END IF;

  v_percent_after := LEAST(GREATEST(((v_total - v_available) / v_total) * 100, 0), 100);
  v_percent_before := LEAST(GREATEST(((v_total - v_available_before) / v_total) * 100, 0), 100);

  v_alert_cycle := (date_part('year', v_occurred_at)::int * 100) + date_part('month', v_occurred_at)::int;

  FOREACH v_threshold IN ARRAY ARRAY [50, 75, 90, 100]
  LOOP
    IF v_percent_after >= v_threshold AND v_percent_before < v_threshold THEN
      PERFORM pgmq.send(
        'credit_usage_alerts',
        jsonb_build_object(
          'function_name', 'credit_usage_alerts',
          'function_type', NULL,
          'payload', jsonb_build_object(
            'org_id', NEW.org_id,
            'threshold', v_threshold,
            'percent_used', ROUND(v_percent_after, 2),
            'total_credits', v_total,
            'available_credits', v_available,
            'alert_cycle', v_alert_cycle,
            'transaction_id', NEW.id
          )
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enqueue_credit_usage_alert() OWNER TO postgres;

DROP TRIGGER IF EXISTS credit_usage_alert_on_transactions ON public.usage_credit_transactions;

CREATE TRIGGER credit_usage_alert_on_transactions
AFTER INSERT ON public.usage_credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_credit_usage_alert();

-- Process the new queue alongside other high-frequency triggers
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks() RETURNS void LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
BEGIN
  -- Get current time components in UTC
  current_hour := EXTRACT(HOUR FROM NOW());
  current_minute := EXTRACT(MINUTE FROM NOW());
  current_second := EXTRACT(SECOND FROM NOW());

  -- Every 10 seconds: High-frequency queues (at :00, :10, :20, :30, :40, :50)
  IF current_second % 10 = 0 THEN
    -- Process high-frequency queues with default batch size (950)
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_create', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create', 'credit_usage_alerts']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (high-frequency) failed: %', SQLERRM;
    END;

    -- Process channel device counts with batch size 1000
    BEGIN
      PERFORM public.process_channel_device_counts_queue(1000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_channel_device_counts_queue failed: %', SQLERRM;
    END;

  END IF;

  -- Every minute (at :00 seconds): Per-minute tasks
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.delete_accounts_marked_for_deletion();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_accounts_marked_for_deletion failed: %', SQLERRM;
    END;

    -- Process with batch size 10
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_sync_sub', 'cron_stat_app'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (per-minute) failed: %', SQLERRM;
    END;

    -- on_manifest_create uses default batch size
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_manifest_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (manifest_create) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 5 minutes (at :00 seconds): Org stats with batch size 10
  IF current_minute % 5 = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_stat_org'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (cron_stat_org) failed: %', SQLERRM;
    END;
  END IF;

  -- Every hour (at :00:00): Hourly cleanup
  IF current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.cleanup_frequent_job_details();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_frequent_job_details failed: %', SQLERRM;
    END;
  END IF;

  -- Every 2 hours (at :00:00): Low-frequency queues with default batch size
  IF current_hour % 2 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (low-frequency) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 6 hours (at :00:00): Stats jobs
  IF current_hour % 6 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_stats_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_stats_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:00:00 - Midnight tasks
  IF current_hour = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.cleanup_queue_messages();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_queue_messages failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.delete_old_deleted_apps();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_old_deleted_apps failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.remove_old_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remove_old_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:40:00 - Old app version retention
  IF current_hour = 0 AND current_minute = 40 AND current_second = 0 THEN
    BEGIN
      PERFORM public.update_app_versions_retention();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'update_app_versions_retention failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 01:01:00 - Admin stats creation
  IF current_hour = 1 AND current_minute = 1 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_admin_stats();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_admin_stats failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 03:00:00 - Free trial and credits
  IF current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_free_trial_expired();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_free_trial_expired failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.expire_usage_credits();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_usage_credits failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 04:00:00 - Sync sub scheduler
  IF current_hour = 4 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_sync_sub_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_sync_sub_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 12:00:00 - Noon tasks
  IF current_hour = 12 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      DELETE FROM cron.job_run_details WHERE end_time < NOW() - interval '7 days';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup job_run_details failed: %', SQLERRM;
    END;

    -- Weekly stats email (every Saturday at noon)
    IF EXTRACT(DOW FROM NOW()) = 6 THEN
      BEGIN
        PERFORM public.process_stats_email_weekly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_weekly failed: %', SQLERRM;
      END;
    END IF;

    -- Monthly stats email (1st of month at noon)
    IF EXTRACT(DAY FROM NOW()) = 1 THEN
      BEGIN
        PERFORM public.process_stats_email_monthly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_monthly failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;


COMMIT;
