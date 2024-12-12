CREATE POLICY "Allow apikey to manage they folder" ON "storage"."objects" FOR SELECT TO "anon" USING (
  (
    ("bucket_id" = 'apps'::"text")
    AND (
      "public"."check_min_rights" (
        'read'::"public"."user_min_right",
        "public"."get_identity" ('{read,upload,write,all}'::"public"."key_mode" []),
        (("storage"."foldername" ("name")) [0])::uuid,
        (("storage"."foldername" ("name")) [1])::character varying,
        NULL::bigint
      )
    )
  )
);

CREATE POLICY "Allow apikey to manage they folder 21" ON "storage"."objects" FOR INSERT TO "anon" WITH CHECK (
  (
    ("bucket_id" = 'images'::"text")
    AND (
      "public"."check_min_rights" (
        'read'::"public"."user_min_right",
        "public"."get_identity" ('{read,upload,write,all}'::"public"."key_mode" []),
        (("storage"."foldername" ("name")) [0])::uuid,
        (("storage"."foldername" ("name")) [1])::character varying,
        NULL::bigint
      )
    )
  )
);
