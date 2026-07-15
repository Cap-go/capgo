ALTER TABLE "public"."users"
ADD COLUMN "discord_username" character varying(32),
ADD COLUMN "github_username" character varying(39);

COMMENT ON COLUMN "public"."users"."discord_username" IS 'Optional Discord username supplied by the user for future experience enrichment.';
COMMENT ON COLUMN "public"."users"."github_username" IS 'Optional GitHub username supplied by the user for future experience enrichment.';
