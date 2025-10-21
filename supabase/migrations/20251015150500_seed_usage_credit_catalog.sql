-- Seed usage credit catalog with purchasable credit packs

BEGIN;

INSERT INTO public.usage_credit_catalog (
  slug,
  name,
  description,
  credits_amount,
  price_amount,
  price_currency,
  stripe_price_id,
  is_active
)
VALUES
  (
    'usage-credit-pack-500',
    'Usage Credit Pack - $500',
    'One-time pack providing 500 usage credits.',
    500,
    500,
    'usd',
    NULL,
    true
  ),
  (
    'usage-credit-pack-1000',
    'Usage Credit Pack - $1,000',
    'One-time pack providing 1,000 usage credits.',
    1000,
    1000,
    'usd',
    NULL,
    true
  ),
  (
    'usage-credit-pack-5000',
    'Usage Credit Pack - $5,000',
    'One-time pack providing 5,000 usage credits.',
    5000,
    5000,
    'usd',
    NULL,
    true
  ),
  (
    'usage-credit-pack-10000',
    'Usage Credit Pack - $10,000',
    'One-time pack providing 10,000 usage credits.',
    10000,
    10000,
    'usd',
    NULL,
    true
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  credits_amount = EXCLUDED.credits_amount,
  price_amount = EXCLUDED.price_amount,
  price_currency = EXCLUDED.price_currency,
  stripe_price_id = EXCLUDED.stripe_price_id,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
