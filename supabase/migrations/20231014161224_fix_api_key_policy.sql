BEGIN;
  ALTER POLICY "allow apikey to select" ON "public"."apps" USING (is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all,write,upload,read}'::key_mode[], app_id));
COMMIT;

BEGIN;
  ALTER POLICY "Allow api to insert" ON "public"."channels" TO anon;
COMMIT;

BEGIN;
  ALTER POLICY "Allow api to update" ON "public"."channels" TO anon;
COMMIT;
