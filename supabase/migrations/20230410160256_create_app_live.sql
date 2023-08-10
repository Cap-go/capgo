CREATE TABLE "public"."app_live" (
    "id" uuid NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "url" text NOT NULL,
    CONSTRAINT "app_live_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    PRIMARY KEY ("id")
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.app_live FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
