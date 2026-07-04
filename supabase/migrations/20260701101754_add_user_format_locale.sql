ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "format_locale" character varying;

COMMENT ON COLUMN "public"."users"."format_locale" IS 'Optional BCP 47 locale tag used for date and number formatting. Language stays independent from formatting.';
