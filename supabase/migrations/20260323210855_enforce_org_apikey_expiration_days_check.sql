ALTER TABLE public.orgs
DROP CONSTRAINT IF EXISTS orgs_max_apikey_expiration_days_check;

ALTER TABLE public.orgs
ADD CONSTRAINT orgs_max_apikey_expiration_days_check
CHECK (
    max_apikey_expiration_days IS NULL
    OR max_apikey_expiration_days BETWEEN 1 AND 365
);
