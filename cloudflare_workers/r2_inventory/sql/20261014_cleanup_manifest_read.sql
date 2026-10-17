-- Review/apply separately on PlanetScale capgo/capgo-r2-inventory/main, postgres.
-- No Supabase change. The existing restricted role already writes inventory and checkpoints.
-- Exact reference probes require only this replicated column, not manifest metadata.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT SELECT (s3_path) ON TABLE public.manifest TO r2_inventory_consumer;
COMMIT;
