-- Evaluate audit_logs_allowed_orgs() once per statement instead of once per
-- audit_logs row. This keeps API-key access on the normal RLS path while making
-- unauthenticated anon requests fail fast with an empty allowed org list.

DROP POLICY IF EXISTS "Allow select for auth, api keys (super_admin+)" -- noqa: RF05,LT05
ON public.audit_logs;
DROP POLICY IF EXISTS "Allow select for auth (super_admin+)" -- noqa: RF05
ON public.audit_logs;

CREATE POLICY "Allow select for auth, api keys (super_admin+)" -- noqa: RF05,LT05
ON public.audit_logs
FOR SELECT
TO anon, authenticated
USING (
    org_id = ANY(
        COALESCE((SELECT public.audit_logs_allowed_orgs()), '{}'::uuid [])
    )
);
