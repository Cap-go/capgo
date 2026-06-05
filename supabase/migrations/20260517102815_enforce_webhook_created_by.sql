-- Existing webhooks created from the dashboard could omit created_by because the
-- column was nullable and the direct Supabase insert path did not populate it.
UPDATE "public"."webhooks" AS "webhook"
SET "created_by" = "orgs"."created_by"
FROM "public"."orgs" AS "orgs"
WHERE "webhook"."org_id" = "orgs"."id"
  AND "webhook"."created_by" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."webhooks"
    WHERE "created_by" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce webhooks.created_by NOT NULL while null rows remain';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_webhook_created_by"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  "creator_id" uuid;
BEGIN
  IF (SELECT "public"."get_apikey_header"()) IS NOT NULL THEN
    "creator_id" := "public"."get_identity_org_allowed_apikey_only"(
      '{all,write,upload}'::"public"."key_mode"[],
      NEW."org_id"
    );
  ELSE
    "creator_id" := "auth"."uid"();
  END IF;

  IF "creator_id" IS NOT NULL THEN
    NEW."created_by" := "creator_id";
  ELSIF NEW."created_by" IS NULL THEN
    SELECT "orgs"."created_by"
    INTO "creator_id"
    FROM "public"."orgs" AS "orgs"
    WHERE "orgs"."id" = NEW."org_id";

    NEW."created_by" := "creator_id";
  END IF;

  IF NEW."created_by" IS NULL THEN
    RAISE EXCEPTION 'webhooks.created_by cannot be null';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_webhook_created_by"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."set_webhook_created_by"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_webhook_created_by"() TO "service_role";

DROP TRIGGER IF EXISTS "set_webhook_created_by" ON "public"."webhooks";
CREATE TRIGGER "set_webhook_created_by"
BEFORE INSERT ON "public"."webhooks"
FOR EACH ROW
EXECUTE FUNCTION "public"."set_webhook_created_by"();

CREATE OR REPLACE FUNCTION "public"."reassign_webhook_created_by_before_user_delete"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Preserve org-owned webhooks when a non-owner creator deletes their account.
  UPDATE "public"."webhooks" AS "webhook"
  SET "created_by" = "orgs"."created_by"
  FROM "public"."orgs" AS "orgs"
  WHERE "webhook"."org_id" = "orgs"."id"
    AND "webhook"."created_by" = OLD."id"
    AND "orgs"."created_by" <> OLD."id";

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() TO "service_role";

DROP TRIGGER IF EXISTS "reassign_webhook_created_by_before_user_delete" ON "public"."users";
CREATE TRIGGER "reassign_webhook_created_by_before_user_delete"
BEFORE DELETE ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."reassign_webhook_created_by_before_user_delete"();

ALTER TABLE "public"."webhooks"
DROP CONSTRAINT IF EXISTS "webhooks_created_by_fkey";

ALTER TABLE "public"."webhooks"
ALTER COLUMN "created_by" SET NOT NULL;

ALTER TABLE "public"."webhooks"
ADD CONSTRAINT "webhooks_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;
