ALTER TABLE public.stripe_info
DROP COLUMN IF EXISTS subscription_metered;

DROP FUNCTION IF EXISTS get_metered_usage(orgid uuid);
DROP FUNCTION IF EXISTS get_metered_usage();
