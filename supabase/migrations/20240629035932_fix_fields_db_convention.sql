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
        WHEN channels."secondVersion" not in (select version from stats where stats.action='update_fail' and 10800 > extract(epoch from now()) - extract(epoch from stats.created_at)) 
        THEN "secondary_version_percentage" + 0.1 
        ELSE 0 
    END
    WHERE channels.enable_progressive_deploy = true
    AND channels."secondary_version_percentage" between 0 AND 0.9;
END;
$$