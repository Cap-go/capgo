DROP TABLE "public"."channel_users";

DROP POLICY "Allow all users to selec present in channel" ON "public"."users";

DROP POLICY "Allow shared to see" ON "public"."app_versions";

DROP POLICY "allowed shared to select" ON "public"."apps";

DROP POLICY "Select if app is shared with you or api" ON "public"."channels";

CREATE POLICY "Select if app api" ON "public"."channels" FOR SELECT TO "authenticated" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read}'::"public"."key_mode"[], "app_id"));

DROP POLICY  "Allow user or shared to manage they folder 1sbjm_0" ON storage.objects;

CREATE POLICY "Allow user or shared to manage they folder 1sbjm_0" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'apps'::text) AND (((auth.uid())::text = (storage.foldername(name))[0])));

DROP FUNCTION public.is_app_shared(appid character varying);

DROP FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying);

DROP FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid");

DROP FUNCTION "public"."is_in_channel"(userid uuid);

DROP FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint);

DROP FUNCTION "public"."is_version_shared"(versionid bigint);

