-- DROP POLICY "Allow all for auth (admin+)" on "public"."channels"; Commented: commened in base.sql
CREATE POLICY "Allow all for auth (admin+) (any apikey)" ON "public"."channels" TO "authenticated",
"anon" USING (
    "public"."check_min_rights"(
        'admin'::"public"."user_min_right",
        "public"."get_identity"(
            '{read,upload,write,all}'::"public"."key_mode" []
        ),
        "owner_org",
        "app_id",
        NULL::BIGINT
    )
) WITH CHECK (
    "public"."check_min_rights"(
        'admin'::"public"."user_min_right",
        "public"."get_identity"(
            '{read,upload,write,all}'::"public"."key_mode" []
        ),
        "owner_org",
        "app_id",
        NULL::BIGINT
    )
);
