-- Org-level onboarding intent: what the org's creator wants to do with Capgo
-- first (OTA updates, native builds, both, or just exploring). Captured during
-- org onboarding. NOT NULL with a default of 'unknown' so existing rows are
-- backfilled automatically.
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "onboarding_intent" "text" DEFAULT 'unknown'::"text" NOT NULL;

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "orgs_onboarding_intent_valid" CHECK (("onboarding_intent" = ANY (ARRAY['unknown'::"text", 'ota'::"text", 'builder'::"text", 'both'::"text", 'exploring'::"text"])));

COMMENT ON COLUMN "public"."orgs"."onboarding_intent" IS 'What the org creator chose during onboarding: unknown | ota | builder | both | exploring. Used for segmentation and to tailor the org experience.';
