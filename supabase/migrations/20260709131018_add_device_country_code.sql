ALTER TABLE "public"."devices"
ADD COLUMN "country_code" character varying(2);

COMMENT ON COLUMN "public"."devices"."country_code" IS 'Latest ISO 3166-1 alpha-2 country code reported by Cloudflare for device update requests.';
