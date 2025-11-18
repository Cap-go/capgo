BEGIN;

CREATE TABLE IF NOT EXISTS public.capgo_credit_products (
    slug text NOT NULL,
    environment text NOT NULL DEFAULT 'live',
    provider text NOT NULL DEFAULT 'stripe',
    product_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT capgo_credit_products_environment_check CHECK (environment IN ('live', 'test')),
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

INSERT INTO public.capgo_credit_products (slug, environment, provider, product_id)
VALUES
    ('credit_top_up', 'live', 'stripe', 'prod_TINXCAiTb8Vsxc'),
    ('credit_top_up', 'test', 'stripe', 'prod_TJRd2hFHZsBIPK')
ON CONFLICT (slug, environment) DO UPDATE
SET product_id = EXCLUDED.product_id;

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
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_expires timestamptz := COALESCE(p_expires_at, now() + interval '1 year');
  v_source_ref jsonb := p_source_ref;
  v_session_id text := NULLIF(v_source_ref ->> 'sessionId', '');
  v_payment_intent_id text := NULLIF(v_source_ref ->> 'paymentIntentId', '');
  v_grant_id uuid;
  v_transaction_id bigint;
  v_available numeric := 0;
  v_total numeric := 0;
  v_next_expiration timestamptz;
  v_existing_transaction_id bigint;
  v_existing_grant_id uuid;
BEGIN
  IF current_user <> 'postgres' AND COALESCE(v_request_role, '') <> 'service_role' THEN
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
      COALESCE(NULLIF(p_source, ''), 'manual'),
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
      'purchase',
      p_amount,
      v_available,
      p_notes,
      v_source_ref
    )
    RETURNING id INTO v_transaction_id;

    grant_id := v_grant_id;
    transaction_id := v_transaction_id;
    available_credits := v_available;
    total_credits := v_total;
    next_expiration := v_next_expiration;

    RETURN NEXT;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    IF v_session_id IS NULL AND v_payment_intent_id IS NULL THEN
      RAISE;
    END IF;

    SELECT id, grant_id
    INTO v_existing_transaction_id, v_existing_grant_id
    FROM public.usage_credit_transactions
    WHERE org_id = p_org_id
      AND transaction_type = 'purchase'
      AND (
        (v_session_id IS NOT NULL AND source_ref ->> 'sessionId' = v_session_id)
        OR (v_payment_intent_id IS NOT NULL AND source_ref ->> 'paymentIntentId' = v_payment_intent_id)
      )
    ORDER BY id DESC
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

    grant_id := v_existing_grant_id;
    transaction_id := v_existing_transaction_id;
    available_credits := v_available;
    total_credits := v_total;
    next_expiration := v_next_expiration;

    RETURN NEXT;
    RETURN;
  END;
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

COMMIT;
