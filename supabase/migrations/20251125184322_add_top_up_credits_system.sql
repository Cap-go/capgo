BEGIN;

CREATE TABLE IF NOT EXISTS public.capgo_credit_products (
    slug text NOT NULL,
    environment text NOT NULL,
    provider text NOT NULL,
    product_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT capgo_credit_products_slug_environment_pk PRIMARY KEY (slug, environment)
);

COMMENT ON TABLE public.capgo_credit_products IS 'Stripe product references used for credit flows (top-ups, add-ons, etc).';
COMMENT ON COLUMN public.capgo_credit_products.slug IS 'Stable identifier for the credit product (e.g. credit_top_up).';
COMMENT ON COLUMN public.capgo_credit_products.environment IS 'Stripe environment the product belongs to (live or test).';
COMMENT ON COLUMN public.capgo_credit_products.provider IS 'Payment provider for the product (stripe, etc).';
COMMENT ON COLUMN public.capgo_credit_products.product_id IS 'Provider product identifier (e.g. Stripe prod_***).';

CREATE UNIQUE INDEX IF NOT EXISTS capgo_credit_products_provider_product_idx
    ON public.capgo_credit_products (provider, product_id);

CREATE TRIGGER handle_capgo_credit_products_updated_at
    BEFORE UPDATE ON public.capgo_credit_products
    FOR EACH ROW
    EXECUTE FUNCTION extensions.moddatetime('updated_at');

DO $$
DECLARE
    c_provider CONSTANT text := 'stripe';
    c_product_slug CONSTANT text := 'credit_top_up';
    c_env_live CONSTANT text := 'live';
    c_env_test CONSTANT text := 'test';
BEGIN
    ALTER TABLE public.capgo_credit_products
    ALTER COLUMN provider SET DEFAULT c_provider;

    ALTER TABLE public.capgo_credit_products
    ALTER COLUMN environment SET DEFAULT c_env_live;

    ALTER TABLE public.capgo_credit_products
    DROP CONSTRAINT IF EXISTS capgo_credit_products_environment_check;

    ALTER TABLE public.capgo_credit_products
    ADD CONSTRAINT capgo_credit_products_environment_check
    CHECK (environment IN (c_env_live, c_env_test));

    INSERT INTO public.capgo_credit_products (slug, environment, provider, product_id)
    VALUES
        (c_product_slug, c_env_live, c_provider, 'prod_TINXCAiTb8Vsxc'),
        (c_product_slug, c_env_test, c_provider, 'prod_TJRd2hFHZsBIPK')
    ON CONFLICT (slug, environment) DO UPDATE
    SET product_id = EXCLUDED.product_id;
END;
$$;

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
  c_purchase CONSTANT text := 'purchase';
  c_session_id_key CONSTANT text := 'sessionId';
  c_payment_intent_key CONSTANT text := 'paymentIntentId';
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_expires timestamptz := COALESCE(p_expires_at, now() + interval '1 year');
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
      now(),
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

COMMIT;
