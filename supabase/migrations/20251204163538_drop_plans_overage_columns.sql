BEGIN;

ALTER TABLE public.plans
DROP COLUMN IF EXISTS storage_unit,
DROP COLUMN IF EXISTS bandwidth_unit,
DROP COLUMN IF EXISTS mau_unit,
DROP COLUMN IF EXISTS price_m_storage_id,
DROP COLUMN IF EXISTS price_m_bandwidth_id,
DROP COLUMN IF EXISTS price_m_mau_id;

COMMIT;
