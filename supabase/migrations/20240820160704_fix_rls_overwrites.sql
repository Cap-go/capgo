CREATE POLICY 
"Allow update for auth, api keys (write+)" 
ON "public"."devices_override" 
FOR UPDATE TO "authenticated", "anon" 
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY 
"Allow update for auth, api keys (write+)" 
ON "public"."channel_devices" 
FOR UPDATE TO "authenticated", "anon" 
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));