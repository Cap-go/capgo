-- Org-level onboarding answers. A JSONB bag (not a single column) so we can add
-- more onboarding questions later without another migration. Today it holds the
-- creator's intent:
--   {"intent": "unknown" | "ota" | "builder" | "both" | "exploring"}
-- NOT NULL with a default, so existing rows backfill to {"intent": "unknown"}.
-- Value validation lives in the application layer (organization edge function)
-- to keep the shape easy to extend.
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "onboarding" "jsonb" DEFAULT '{"intent": "unknown"}'::"jsonb" NOT NULL;

COMMENT ON COLUMN "public"."orgs"."onboarding" IS 'Onboarding answers (extensible JSONB). Currently: {"intent": unknown|ota|builder|both|exploring}. Used for segmentation and to tailor the org experience.';
