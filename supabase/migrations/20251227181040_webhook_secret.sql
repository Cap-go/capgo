-- Add secret field to webhooks for request signing
-- The secret is used to generate HMAC-SHA256 signatures sent in X-Capgo-Signature header

-- Add the secret column
ALTER TABLE "public"."webhooks" ADD COLUMN IF NOT EXISTS "secret" TEXT;

-- Generate secrets for existing webhooks (UUID-based for simplicity)
UPDATE "public"."webhooks"
SET "secret" = 'whsec_' || replace(gen_random_uuid()::text, '-', '')
WHERE "secret" IS NULL;

-- Make secret NOT NULL after populating existing rows
ALTER TABLE "public"."webhooks" ALTER COLUMN "secret" SET NOT NULL;

-- Add default for new webhooks
ALTER TABLE "public"."webhooks" ALTER COLUMN "secret" SET DEFAULT 'whsec_' || replace(gen_random_uuid()::text, '-', '');

-- Add comment
COMMENT ON COLUMN "public"."webhooks"."secret" IS 'Secret key for HMAC-SHA256 signature verification. Format: whsec_{32-char-hex}';
