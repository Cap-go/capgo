DROP FUNCTION read_version_usage(character varying,timestamp without time zone,timestamp without time zone);

CREATE OR REPLACE FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "version_id" bigint, "date" "timestamp", "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    version_usage.app_id,
    version_usage.version_id as version_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM version_usage
  WHERE
    version_usage.app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY date, version_usage.app_id, version_usage.version_id
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

--- 

DROP FUNCTION "public"."read_device_usage";
CREATE OR REPLACE FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone)
RETURNS TABLE("date" date, "mau" bigint, "app_id" character varying)
LANGUAGE "plpgsql"
AS $$
BEGIN
  RETURN QUERY
  SELECT
    subquery.date,
    COUNT(DISTINCT subquery.device_id) AS mau,
    subquery.app_id
  FROM (
    SELECT
      DATE(timestamp) AS date,
      blob1 AS device_id,
      index1 AS app_id
    FROM device_usage
    WHERE
      index1 = p_app_id
      AND timestamp >= p_period_start
      AND timestamp < p_period_end
  ) AS subquery
  GROUP BY subquery.date, subquery.app_id
  ORDER BY subquery.date;
END;
$$;

ALTER FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

---

DROP FUNCTION "public"."read_bandwidth_usage";
CREATE OR REPLACE FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "timestamp", "bandwidth" numeric, "app_id" character varying)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(file_size) AS bandwidth,
    bandwidth_usage.app_id
  FROM bandwidth_usage
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND bandwidth_usage. app_id = p_app_id
  GROUP BY bandwidth_usage.app_id, date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_identity"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
Begin
  SELECT auth.uid() into auth_uid;

  -- JWT auth.uid is not null, reutrn
  IF auth_uid IS NOT NULL THEN
    return auth_uid;
  END IF;

  -- JWT is null
  RETURN NULL;
End;
$$;

CREATE INDEX finx_apikeys_user_id ON "public"."apikeys" USING btree (user_id);
CREATE INDEX finx_app_versions_owner_org ON "public"."app_versions" USING btree (owner_org);
CREATE INDEX finx_app_versions_meta_owner_org ON "public"."app_versions_meta" USING btree (owner_org);
CREATE INDEX finx_apps_user_id ON "public"."apps" USING btree (user_id);
CREATE INDEX finx_apps_owner_org ON "public"."apps" USING btree (owner_org);
CREATE INDEX finx_channel_devices_app_id ON "public"."channel_devices" USING btree (app_id);
CREATE INDEX finx_channel_devices_channel_id ON "public"."channel_devices" USING btree (channel_id);
CREATE INDEX finx_channel_devices_owner_org ON "public"."channel_devices" USING btree (owner_org);
CREATE INDEX finx_devices_override_app_id ON "public"."devices_override" USING btree (app_id);
CREATE INDEX finx_devices_override_version ON "public"."devices_override" USING btree (version);
CREATE INDEX finx_devices_override_owner_org ON "public"."devices_override" USING btree (owner_org);
CREATE INDEX finx_channels_owner_org ON "public"."channels" USING btree (owner_org);
CREATE INDEX finx_channels_app_id ON "public"."channels" USING btree (app_id);
CREATE INDEX finx_channels_secondVersion ON "public"."channels" USING btree ("secondVersion");
CREATE INDEX finx_channels_version ON "public"."channels" USING btree (version);
CREATE INDEX finx_notifications_owner_org ON "public"."notifications" USING btree (owner_org);
CREATE INDEX finx_org_users_channel_id ON "public"."org_users" USING btree (channel_id);
CREATE INDEX finx_org_users_org_id ON "public"."org_users" USING btree (org_id);
CREATE INDEX finx_org_users_user_id ON "public"."org_users" USING btree (user_id);
CREATE INDEX finx_orgs_created_by ON "public"."orgs" USING btree (created_by);
CREATE INDEX finx_orgs_stripe_info ON "public"."stripe_info" USING btree (product_id);

drop index idx_device_usage_timestamp;
drop index idx_device_usage_device_id;
drop index idx_device_usage_app_id;
drop index idx_daily_version_version;
drop index idx_daily_version_date;
drop index idx_bandwidth_usage_timestamp;
drop index idx_bandwidth_usage_device_id;
drop index idx_bandwidth_usage_app_id;
