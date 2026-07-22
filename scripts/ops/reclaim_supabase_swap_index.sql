-- Capgo-EU: create dual-storage candidate index WITHOUT a surrounding transaction.
-- Run this ALONE before scripts/ops/reclaim_supabase_swap.sql.
--
-- Why separate file:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--   Supabase SQL Editor wraps multi-statement scripts in one transaction.
--
-- psql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/reclaim_supabase_swap_index.sql
-- SQL Editor: paste ONLY the CREATE INDEX statement below (nothing else).

CREATE INDEX CONCURRENTLY IF NOT EXISTS app_versions_manifest_present_idx
  ON public.app_versions USING btree (id)
  WHERE manifest IS NOT NULL;
