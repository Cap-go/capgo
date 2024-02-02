DROP POLICY "allow apikey to delete" ON "public"."app_versions";

DROP POLICY "Allow org member's apikey to update" ON "public"."app_versions";

DROP POLICY "Allow update by the CLI (apikey)" ON "public"."app_versions";

CREATE POLICY "allow apikey to upload" ON "public"."app_versions" FOR UPDATE TO "anon" 
USING (
  (
  "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all,upload}'::"public"."key_mode"[], "app_id")
  OR
  "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all,upload}'::"public"."key_mode"[], "app_id", NULL::bigint, 'upload'::"public"."user_min_right", "user_id")
  )
  AND 
  "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), "app_id")
) WITH CHECK (
  (
  "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all,upload}'::"public"."key_mode"[], "app_id")
  OR
  "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all,upload}'::"public"."key_mode"[], "app_id", NULL::bigint, 'upload'::"public"."user_min_right", "user_id")
  )
  AND 
  "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), "app_id")
);
