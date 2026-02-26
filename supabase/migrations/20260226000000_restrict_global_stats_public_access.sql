-- =============================================================================
-- Migration: Restrict global_stats access to platform admins only
-- =============================================================================

-- Remove the permissive anonymous read policy that currently exposes KPI data.
DROP POLICY IF EXISTS "Allow anon to select" ON public.global_stats;

-- Replace with an admin-only read policy.
DROP POLICY IF EXISTS "Deny anon and authenticated reads" ON public.global_stats;
DROP POLICY IF EXISTS "Allow admin users to select global_stats" ON public.global_stats;
CREATE POLICY "Allow admin users to select global_stats"
ON public.global_stats
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT
      1
    FROM
      (SELECT auth.uid() AS uid) AS auth_user
    WHERE
      public.is_admin(auth_user.uid)
  )
);

-- Remove table privileges for low-trust roles.
REVOKE ALL PRIVILEGES ON TABLE public.global_stats FROM anon, authenticated;
GRANT SELECT ON TABLE public.global_stats TO authenticated;
