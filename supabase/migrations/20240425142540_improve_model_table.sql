-- Modify table to have default timestamp
DROP TABLE IF EXISTS version_meta;
CREATE TABLE version_meta (
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  app_id VARCHAR(255),
  version_id BIGINT,
  size BIGINT,
  PRIMARY KEY (timestamp, app_id, version_id, size)
);

DROP TABLE IF EXISTS version_usage;
CREATE TABLE version_usage (
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  app_id VARCHAR(255),
  version BIGINT,
  action VARCHAR(20),
  PRIMARY KEY (timestamp, app_id, version, action)
);

-- Prevent user to acccess raw data
CREATE POLICY "Disable for all" ON "public"."version_meta" USING (false) WITH CHECK (false);
CREATE POLICY "Disable for all" ON "public"."version_usage" USING (false) WITH CHECK (false);
CREATE POLICY "Disable for all" ON "public"."storage_usage" USING (false) WITH CHECK (false);
CREATE POLICY "Disable for all" ON "public"."device_usage" USING (false) WITH CHECK (false);
CREATE POLICY "Disable for all" ON "public"."bandwidth_usage" USING (false) WITH CHECK (false);

-- Allow read for auth (read+) user from same org
CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_mau"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));
CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_bandwidth"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));
CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_storage"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));
CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_version"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));


-- Add missing rights for old tables
CREATE POLICY "Allow read for auth (read+)" ON "public"."stats"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));
CREATE POLICY "Allow read for auth (read+)" ON "public"."devices"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

