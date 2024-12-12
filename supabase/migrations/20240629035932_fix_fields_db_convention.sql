ALTER TABLE app_versions 
RENAME COLUMN "minUpdateVersion" TO min_update_version;

ALTER TABLE channels
RENAME COLUMN "disableAutoUpdateUnderNative" TO disable_auto_update_under_native;

ALTER TABLE channels
RENAME COLUMN "enableAbTesting" TO enable_ab_testing;

ALTER TABLE channels 
RENAME COLUMN "secondaryVersionPercentage" TO secondary_version_percentage;

ALTER TABLE channels 
RENAME COLUMN "secondVersion" TO second_version;

ALTER TABLE channels 
RENAME COLUMN "disableAutoUpdate" TO disable_auto_update;

CREATE OR REPLACE PROCEDURE "public"."update_channels_progressive_deploy"()
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE channels
    SET "secondary_version_percentage" = CASE 
        WHEN channels."second_version" not in (select version from stats where stats.action='update_fail' and 10800 > extract(epoch from now()) - extract(epoch from stats.created_at)) 
        THEN "secondary_version_percentage" + 0.1 
        ELSE 0 
    END
    WHERE channels.enable_progressive_deploy = true
    AND channels."secondary_version_percentage" between 0 AND 0.9;
END;
$$;

select
    cron.schedule('Update channel for progressive deploy if too many fail', '*/10 * * * *', $$CALL update_channels_progressive_deploy()$$);

-- Add dummy columns

ALTER TABLE channels 
ADD COLUMN "secondVersion" bigint;

--- 

ALTER TABLE app_versions 
ADD COLUMN "minUpdateVersion" character varying;

CREATE OR REPLACE FUNCTION "public"."sync_min_update_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF NEW."minUpdateVersion" IS DISTINCT FROM OLD."minUpdateVersion"
  THEN
    NEW.min_update_version = NEW."minUpdateVersion";
  END IF;

  RETURN NEW;
END;$$;

UPDATE app_versions
SET "minUpdateVersion"="min_update_version";

CREATE OR REPLACE TRIGGER "sync_min_update_version" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_min_update_version"();

-- 

ALTER TABLE channels 
ADD COLUMN "secondaryVersionPercentage" double precision;

-- UPDATE app_versions
-- SET "secondaryVersionPercentage"="secondary_version_percentage";


-- CREATE OR REPLACE FUNCTION "public"."sync_secondary_version_percentage"() RETURNS "trigger"
--     LANGUAGE "plpgsql"
--     AS $$BEGIN
--   IF NEW."secondaryVersionPercentage" IS DISTINCT FROM OLD."secondaryVersionPercentage"
--   THEN
--     NEW.secondary_version_percentage = NEW."secondaryVersionPercentage";
--   END IF;

--   RETURN NEW;
-- END;$$;

-- CREATE OR REPLACE TRIGGER "sync_secondary_version_percentage" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_secondary_version_percentage"();


ALTER TABLE channels 
ADD COLUMN "disableAutoUpdate" "public"."disable_update";

UPDATE channels
SET "disableAutoUpdate"="disable_auto_update";

CREATE OR REPLACE FUNCTION "public"."sync_disable_auto_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF NEW."disableAutoUpdate" IS DISTINCT FROM OLD."disableAutoUpdate"
  THEN
    NEW.disable_auto_update = NEW."disableAutoUpdate";
  END IF;

  RETURN NEW;
END;$$;

CREATE OR REPLACE TRIGGER "sync_disable_auto_update" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."sync_disable_auto_update"();

