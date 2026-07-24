-- Capgo-EU reclaim — Supabase SQL Editor.
-- Run ONE statement at a time. Re-run the same statement until its Notice shows 0.
-- Tiny budgets avoid dashboard statement timeouts.
--
-- Prerequisites: migrations through 20260723113958_cleanup_batch_budget_args
-- (or paste that migration once in SQL Editor first).

-- Step 0 (once): free http response bloat
-- TRUNCATE TABLE net._http_response;

-- Step 1: queues — re-run until archived_deleted=0 and stuck_deleted=0
SELECT public.cleanup_queue_messages(1, 500);

-- Step 2: dual-storage manifests — re-run until updated=0
-- SELECT public.null_migrated_app_version_manifests(3, 25);

-- Step 3: old audit logs — re-run until deleted=0
-- SELECT public.cleanup_old_audit_logs(2, 200);

-- Optional size check:
-- SELECT pg_size_pretty(pg_database_size(current_database())::bigint) AS db_size;
