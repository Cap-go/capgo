-- Security fix: Replace overly permissive manifest SELECT policy with org-scoped access control
-- Previously: USING (true) allowed any authenticated user to read ALL manifest entries cross-org
-- Now: Only users with read access to the app (via check_min_rights) can read its manifest entries

DROP POLICY IF EXISTS "Allow users to read any manifest entry" ON "public"."manifest";

CREATE POLICY "Allow users to read manifest for own org apps"
  ON "public"."manifest"
  FOR SELECT
  TO "anon", "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."app_versions" av
      WHERE av.id = manifest.app_version_id
      AND "public"."check_min_rights"(
        'read'::"public"."user_min_right",
        "public"."get_identity_org_appid"(
          '{read,upload,write,all}'::"public"."key_mode"[],
          av.owner_org,
          av.app_id
        ),
        av.owner_org,
        av.app_id,
        NULL::bigint
      )
    )
  );
