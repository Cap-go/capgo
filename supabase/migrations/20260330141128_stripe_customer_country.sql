ALTER TABLE public.stripe_info
ADD COLUMN IF NOT EXISTS customer_country character varying(2);

COMMENT ON COLUMN public.stripe_info.customer_country IS 'Latest ISO 3166-1 alpha-2 billing country code synced from the Stripe customer profile.';
