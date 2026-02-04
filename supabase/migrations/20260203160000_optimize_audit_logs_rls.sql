-- Restrict audit_logs access to authenticated users only and fail fast for anon
-- to avoid expensive RLS evaluation on unauthenticated requests.

REVOKE ALL ON TABLE "public"."audit_logs" FROM "anon";
REVOKE ALL ON SEQUENCE "public"."audit_logs_id_seq" FROM "anon";

DROP POLICY IF EXISTS "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs";
DROP POLICY IF EXISTS "Allow select for auth (super_admin+)" ON "public"."audit_logs";

CREATE POLICY "Allow select for auth (super_admin+)" ON "public"."audit_logs"
FOR SELECT TO "authenticated"
USING (
  (SELECT public.check_min_rights(
    'super_admin'::public.user_min_right,
    auth_check.uid,
    org_id,
    NULL::character varying,
    NULL::bigint
  )
  FROM (SELECT auth.uid() AS uid) AS auth_check)
);
