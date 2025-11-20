BEGIN;

DO $$
DECLARE
  duplicate_count int;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT source_ref ->> 'sessionId' AS session_id
    FROM public.usage_credit_transactions
    WHERE transaction_type = 'purchase'
      AND source_ref ->> 'sessionId' IS NOT NULL
    GROUP BY source_ref ->> 'sessionId'
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate Stripe checkout sessions – clean up the offending usage_credit_transactions before applying the uniqueness index.', duplicate_count;
  END IF;

  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT source_ref ->> 'paymentIntentId' AS payment_intent_id
    FROM public.usage_credit_transactions
    WHERE transaction_type = 'purchase'
      AND source_ref ->> 'paymentIntentId' IS NOT NULL
    GROUP BY source_ref ->> 'paymentIntentId'
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate Stripe payment intents – clean up the offending usage_credit_transactions before applying the uniqueness index.', duplicate_count;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS usage_credit_transactions_purchase_session_id_idx
  ON public.usage_credit_transactions ((source_ref ->> 'sessionId'))
  WHERE transaction_type = 'purchase'
    AND source_ref ->> 'sessionId' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usage_credit_transactions_purchase_payment_intent_id_idx
  ON public.usage_credit_transactions ((source_ref ->> 'paymentIntentId'))
  WHERE transaction_type = 'purchase'
    AND source_ref ->> 'paymentIntentId' IS NOT NULL;

COMMIT;
