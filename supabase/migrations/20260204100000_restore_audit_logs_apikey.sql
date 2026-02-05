-- Restore audit_logs read access for API key requests (anon role)
-- Keep a single SELECT policy while allowing both authenticated users and API keys.

GRANT SELECT ON TABLE "public"."audit_logs" TO "anon";

DROP POLICY IF EXISTS "Allow select for auth (super_admin+)" ON "public"."audit_logs";
DROP POLICY IF EXISTS "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs";

CREATE POLICY "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs"
FOR SELECT TO "anon", "authenticated"
USING (
  "public"."check_min_rights"(
    'super_admin'::"public"."user_min_right",
    "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], "org_id"),
    "org_id",
    NULL::character varying,
    NULL::bigint
  )
);
