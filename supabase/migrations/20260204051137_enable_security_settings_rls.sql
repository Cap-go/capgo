-- Enable RLS on singleton security settings table
ALTER TABLE "public"."security_settings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny access to security settings"
ON "public"."security_settings"
FOR ALL
TO "authenticated", "anon"
USING (false)
WITH CHECK (false);
