-- =============================================================================
-- Migration: Align global_stats RLS with production
--
-- Production keeps the anon SELECT policy as defense-in-depth while client-role
-- table privileges stay revoked. The restrict migration drops the base policy
-- name; recreate the production policy shell so dev matches prod.
-- =============================================================================

CREATE POLICY " allow anon to select" ON public.global_stats
FOR SELECT
TO anon
USING (true);
