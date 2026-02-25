DROP POLICY IF EXISTS "Allow update for auth (admin+)" ON "public"."orgs";

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_allowed" ('{all,write}'::"public"."key_mode" [], "id"),
      "id",
      NULL::character varying,
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_allowed" ('{all,write}'::"public"."key_mode" [], "id"),
      "id",
      NULL::character varying,
      NULL::bigint
    )
    AND (
      "enforcing_2fa" IS NOT TRUE
      OR "public"."has_2fa_enabled"((auth.uid())::uuid)
    )
  );
