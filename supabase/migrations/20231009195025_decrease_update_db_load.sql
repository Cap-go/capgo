ALTER TABLE "public"."apps"
ADD COLUMN "mainChannel" int8;

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_main_channel_id_fkey" FOREIGN KEY ("mainChannel") REFERENCES "public"."channels"("id") ON DELETE SET DEFAULT;

CREATE OR REPLACE FUNCTION "public"."get_app_main_channel"("app_id" character varying) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    channels channels[];
BEGIN

    SELECT ARRAY(SELECT row(channels.*) FROM channels where channels.app_id = get_app_main_channel.app_id and channels.public = true) into channels;

    IF (select array_length(channels, 1)) != 1 THEN
      -- Here the channels are != 1. That means that there is no clear default channel
      RETURN NULL;
    END IF;

    RETURN (channels[1].id);
END;
$$;

REVOKE EXECUTE ON FUNCTION "public"."get_app_main_channel"("app_id" character varying) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_app_main_channel"("app_id" character varying) FROM anon;
REVOKE EXECUTE ON FUNCTION "public"."get_app_main_channel"("app_id" character varying) FROM authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_app_main_channel"("app_id" character varying) TO postgres;

UPDATE "public"."apps"
SET "mainChannel" = get_app_main_channel("app_id");

CREATE OR REPLACE FUNCTION "public"."update_main_channel_on_channel_update"() RETURNS trigger
   LANGUAGE plpgsql AS
$$BEGIN
    UPDATE "public"."apps"
    SET "mainChannel" = get_app_main_channel("app_id")
    WHERE "app_id" = NEW."app_id";

    RETURN NEW;
END;$$;

CREATE TRIGGER update_app_main_channel_after_channel_update
   AFTER INSERT or UPDATE or DELETE  ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."update_main_channel_on_channel_update"();

ALTER TABLE "public"."devices"
ADD COLUMN "customVersion" int8,
ADD COLUMN "customChannel" int8;

ALTER TABLE ONLY "public"."devices"
ADD CONSTRAINT "app_versions_custom_version_id_fkey" FOREIGN KEY ("customVersion") REFERENCES "public"."app_versions"("id") ON DELETE SET DEFAULT,
ADD CONSTRAINT "app_versions_custom_channel_id_fkey" FOREIGN KEY ("customChannel") REFERENCES "public"."channels"("id") ON DELETE SET DEFAULT;

UPDATE "public"."devices"
SET "customVersion" = (select version from "public"."devices_override" where "public"."devices_override"."device_id" = "public"."devices"."device_id"),
"customChannel" = (select channel_id from "public"."channel_devices" where "public"."channel_devices"."device_id" = "public"."devices"."device_id");