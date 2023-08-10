CREATE TABLE "public"."app_live" (
    "id" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "url" text NOT NULL,
    CONSTRAINT "app_live_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.app_live FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- CREATE POLICY "All self user to all" ON "public"."app_live" AS PERMISSIVE FOR ALL TO authenticated USING (((uid() = id) OR is_admin(uid()))) WITH CHECK (((uid() = id) OR is_admin(uid())));

-- CREATE POLICY "Allow APIKEY to delete" ON "public"."app_live" 
-- AS PERMISSIVE FOR ALL
-- TO anon
-- USING ((is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::key_mode[]) AND is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))))
-- WITH CHECK ((is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::key_mode[]) AND is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))))