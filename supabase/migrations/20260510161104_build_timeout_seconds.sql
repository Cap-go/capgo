ALTER TABLE "public"."apps"
ADD COLUMN IF NOT EXISTS "build_timeout_seconds" bigint DEFAULT 900 NOT NULL;

ALTER TABLE "public"."apps"
ADD COLUMN IF NOT EXISTS "build_timeout_updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "public"."apps"
ADD CONSTRAINT "apps_build_timeout_seconds_check"
CHECK ("build_timeout_seconds" >= 300 AND "build_timeout_seconds" <= 21600);

COMMENT ON COLUMN "public"."apps"."build_timeout_seconds" IS 'Maximum native cloud build runtime in seconds before the job is cancelled and billable time is capped.';

COMMENT ON COLUMN "public"."apps"."build_timeout_updated_at" IS 'Timestamp when the native cloud build timeout setting last changed.';

CREATE OR REPLACE FUNCTION "public"."update_apps_build_timeout_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."build_timeout_updated_at" := COALESCE(NEW."build_timeout_updated_at", now());
  ELSIF NEW."build_timeout_seconds" IS DISTINCT FROM OLD."build_timeout_seconds" THEN
    NEW."build_timeout_updated_at" := now();
  ELSE
    NEW."build_timeout_updated_at" := OLD."build_timeout_updated_at";
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_apps_build_timeout_updated_at"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_apps_build_timeout_updated_at"() FROM PUBLIC;

DROP TRIGGER IF EXISTS "update_apps_build_timeout_updated_at" ON "public"."apps";

CREATE TRIGGER "update_apps_build_timeout_updated_at"
BEFORE INSERT OR UPDATE ON "public"."apps"
FOR EACH ROW
EXECUTE FUNCTION "public"."update_apps_build_timeout_updated_at"();
