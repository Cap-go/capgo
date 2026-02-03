-- Fix apps table INSERT RLS policy to check org-level permissions instead of app-level
-- When creating an app, the app_id doesn't exist yet, so we need to check org-level permissions
-- The check should be for 'write' permission at org level, which maps to 'org.update_settings' in RBAC

DROP POLICY IF EXISTS "Allow insert for apikey (write,all) (admin+)" ON "public"."apps";

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps"
FOR INSERT TO "anon", "authenticated"
WITH CHECK (
  "public"."check_min_rights" (
    'write'::"public"."user_min_right",  -- Changed from 'admin' to 'write' for org-level check
    "public"."get_identity_org_appid" (
      '{write,all}'::"public"."key_mode" [],
      "owner_org",
      NULL::character varying  -- No app_id since we're creating it
    ),
    "owner_org",
    NULL::character varying,   -- Check org-level permissions
    NULL::bigint
  )
);
