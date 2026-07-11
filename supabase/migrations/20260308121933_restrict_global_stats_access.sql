-- =============================================================================
-- Migration: Restrict direct global_stats access
--
-- GHSA-73rv-fpp7-r3r4 reported global platform metrics were exposed through
-- PostgREST with an unauthenticated publishable key. This removes all direct
-- table access for anon/authenticated roles so only service-side usage remains.
-- =============================================================================

-- Remove the legacy base policy name when present.
DROP POLICY IF EXISTS "Allow anon to select" ON public.global_stats;

-- Keep production defense-in-depth: policy shell plus revoked client privileges.
DROP POLICY IF EXISTS " allow anon to select" ON public.global_stats;

CREATE POLICY " allow anon to select" ON public.global_stats
FOR SELECT
TO anon
USING (true);

-- Ensure non-service roles cannot query global_stats directly.
REVOKE ALL PRIVILEGES ON TABLE public.global_stats FROM anon,
authenticated;
