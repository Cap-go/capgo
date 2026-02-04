-- Restrict security_settings access to privileged roles only
REVOKE ALL ON TABLE "public"."security_settings" FROM "anon";
REVOKE ALL ON TABLE "public"."security_settings" FROM "authenticated";

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."security_settings" TO "service_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."security_settings" TO "postgres";

CREATE POLICY "Service role can manage security settings"
ON "public"."security_settings"
FOR ALL
TO "service_role"
USING (true)
WITH CHECK (true);
