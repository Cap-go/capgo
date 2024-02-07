-- CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" text, "appid" character varying)
DROP FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text");
CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN is_allowed_action_user(get_user_id(apikey, appid));
End;
$$;

DROP POLICY "Allow org member's API key to select" ON "public"."apps";

CREATE POLICY "Allow org member's API key to select" ON "public"."apps"
AS PERMISSIVE FOR SELECT
TO anon
USING ("public"."is_allowed_capgkey"(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all,write,read,upload}'::"public"."key_mode"[], app_id, 'read'::"public"."user_min_right", user_id));

-- DROP FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text");