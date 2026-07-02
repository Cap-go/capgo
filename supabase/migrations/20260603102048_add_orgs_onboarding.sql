-- Org-level onboarding answers. A JSONB bag (not a single column) so we can add
-- more onboarding questions later without another migration. Today it holds the
-- creator's intent:
--   {"intent": "unknown" | "ota" | "builder" | "both" | "exploring"}
-- NOT NULL with a default, so existing rows backfill to {"intent": "unknown"}.
-- A CHECK validates the intent value when present; extend it when adding new
-- validated keys.
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "onboarding" "jsonb" DEFAULT '{"intent": "unknown"}'::"jsonb" NOT NULL;

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "orgs_onboarding_valid" CHECK (
  (jsonb_typeof("onboarding") = 'object')
  AND ((NOT ("onboarding" ? 'intent')) OR (("onboarding" ->> 'intent') = ANY (ARRAY['unknown', 'ota', 'builder', 'both', 'exploring'])))
);

COMMENT ON COLUMN "public"."orgs"."onboarding" IS 'Onboarding answers (extensible JSONB). Currently: {"intent": unknown|ota|builder|both|exploring}. Used for segmentation and to tailor the org experience.';
