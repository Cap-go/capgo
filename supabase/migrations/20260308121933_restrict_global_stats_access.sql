-- =============================================================================
-- Migration: Restrict direct global_stats access
--
-- GHSA-73rv-fpp7-r3r4 reported global platform metrics were exposed through
-- PostgREST with an unauthenticated publishable key. This removes all direct
-- table access for anon/authenticated roles so only service-side usage remains.
-- =============================================================================

-- Remove the permissive policy that allowed anonymous reads.
DROP POLICY IF EXISTS "Allow anon to select" ON "public"."global_stats";

-- Ensure non-service roles cannot query global_stats directly.
REVOKE ALL PRIVILEGES ON TABLE "public"."global_stats" FROM "anon", "authenticated";
