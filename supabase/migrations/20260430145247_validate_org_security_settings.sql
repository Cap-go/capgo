UPDATE "public"."orgs"
SET "max_apikey_expiration_days" = NULL
WHERE "max_apikey_expiration_days" IS NOT NULL
  AND (
    "max_apikey_expiration_days" < 1
    OR "max_apikey_expiration_days" > 365
  );

UPDATE "public"."orgs"
SET "required_encryption_key" = NULL
WHERE "required_encryption_key" IS NOT NULL
  AND length("required_encryption_key") NOT IN (20, 21);

ALTER TABLE "public"."orgs"
DROP CONSTRAINT IF EXISTS "orgs_max_apikey_expiration_days_valid";

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "orgs_max_apikey_expiration_days_valid"
CHECK (
  "max_apikey_expiration_days" IS NULL
  OR "max_apikey_expiration_days" BETWEEN 1 AND 365
);

ALTER TABLE "public"."orgs"
DROP CONSTRAINT IF EXISTS "orgs_required_encryption_key_valid";

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "orgs_required_encryption_key_valid"
CHECK (
  "required_encryption_key" IS NULL
  OR length("required_encryption_key") IN (20, 21)
);
