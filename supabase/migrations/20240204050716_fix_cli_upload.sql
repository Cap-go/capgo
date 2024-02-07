DROP POLICY "Allow apikey to insert" ON "public"."app_versions";
DROP POLICY "Allow org member's apikey to insert" ON "public"."app_versions";
CREATE POLICY "Allow apikey to insert" ON "public"."app_versions" FOR INSERT TO "anon"
WITH CHECK (
  (
    ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{upload,write,all}'::"key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::text, true))::"json" ->> 'capgkey'::"text")))
  ) OR (
    "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::text), '{upload,write,all}'::"key_mode"[], "app_id", NULL::bigint, 'upload'::"user_min_right", "user_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::text, true))::json ->> 'capgkey'::text), "app_id")
  )
);

DROP POLICY "Allow apikey to select" ON "public"."app_versions";
-- DROP POLICY "Allow org members to select" on "public"."app_versions";
CREATE POLICY "Allow apikey to select" ON "public"."app_versions" FOR SELECT TO "anon" USING (
  (
    "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::json ->> 'capgkey'::"text"), '{read,all,upload,write}'::"key_mode"[], "app_id") OR 
    "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::json ->> 'capgkey'::"text"), '{read,all,upload,write}'::"key_mode"[], "app_id", 'read'::"user_min_right", "user_id")
  )
);