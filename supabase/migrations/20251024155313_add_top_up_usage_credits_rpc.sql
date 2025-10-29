BEGIN;

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
  v_grant_id uuid;
  v_transaction_id bigint;
  v_available numeric := 0;
  v_total numeric := 0;
  v_next_expiration timestamptz;
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
    p_source_ref,
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
    'grant',
    p_amount,
    v_available,
    p_notes,
    p_source_ref
  )
  RETURNING id INTO v_transaction_id;

  grant_id := v_grant_id;
  transaction_id := v_transaction_id;
  available_credits := v_available;
  total_credits := v_total;
  next_expiration := v_next_expiration;

  RETURN NEXT;
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

GRANT EXECUTE ON FUNCTION public.top_up_usage_credits(uuid, numeric, timestamptz, text, jsonb, text) TO service_role;

COMMIT;
