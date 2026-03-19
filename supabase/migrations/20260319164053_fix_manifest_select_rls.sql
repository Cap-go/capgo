DROP POLICY IF EXISTS "Allow users to read any manifest entry" ON "public"."manifest";
DROP POLICY IF EXISTS "Allow users to read manifest entries for accessible apps" ON "public"."manifest";
DROP POLICY IF EXISTS "Allow select for auth, api keys (read+)" ON "public"."manifest";

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."manifest"
FOR SELECT
TO "anon", "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "public"."app_versions" AS "av"
    WHERE
      "av"."id" = "manifest"."app_version_id"
      AND "public"."check_min_rights"(
        'read'::"public"."user_min_right",
        "public"."get_identity_org_appid"(
          '{read,upload,write,all}'::"public"."key_mode"[],
          "av"."owner_org",
          "av"."app_id"
        ),
        "av"."owner_org",
        "av"."app_id",
        NULL::bigint
      )
  )
);
