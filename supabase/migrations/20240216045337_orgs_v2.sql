
ALTER TABLE app_versions_meta DROP COLUMN user_id;

-- app_versions_meta done

BEGIN;
-- Acquire a lock on the channel_devices table
LOCK TABLE channel_devices IN EXCLUSIVE MODE;

-- channel_devices start
ALTER TABLE channel_devices ADD COLUMN 
owner_org uuid;

UPDATE channel_devices
SET owner_org=get_user_main_org_id_by_app_id(app_id);

COMMIT;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_channel_devices
   BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE channel_devices
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow all to app owner" on "channel_devices";
DROP POLICY "Allow org member (write) to delete" on "channel_devices";
DROP POLICY "Allow org member (write) to insert" on "channel_devices";
DROP POLICY "Allow org member to read" on "channel_devices";

CREATE POLICY "Allow read for auth (read+)" ON "public"."channel_devices"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."channel_devices"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."channel_devices"
AS PERMISSIVE FOR DELETE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

BEGIN;
LOCK TABLE channels IN EXCLUSIVE MODE;

ALTER TABLE channel_devices DROP COLUMN created_by;

-- channel_devices end

-- devices_override start
ALTER TABLE devices_override ADD COLUMN 
owner_org uuid;

UPDATE devices_override
SET owner_org=get_user_main_org_id_by_app_id(app_id);

COMMIT;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_devices_override
   BEFORE INSERT OR UPDATE ON "public"."devices_override" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE devices_override
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "Allow all to app owner" on "devices_override";
DROP POLICY "Allow org member (write) to delete" on "devices_override";
DROP POLICY "Allow org member (write) to insert" on "devices_override";
DROP POLICY "Allow org member to read" on "devices_override";

CREATE POLICY "Allow read for auth (read+)" ON "public"."devices_override"
AS PERMISSIVE FOR SELECT
TO authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."devices_override"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."devices_override"
AS PERMISSIVE FOR DELETE
TO authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE devices_override DROP COLUMN created_by;

-- devices_override end

-- channel table start
ALTER TABLE channels ADD COLUMN 
owner_org uuid;

UPDATE channels
SET owner_org=get_user_main_org_id_by_app_id(app_id);

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE TRIGGER force_valid_owner_org_channels
   BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW
   EXECUTE PROCEDURE "public"."auto_owner_org_by_app_id"();  

ALTER TABLE channels
ALTER COLUMN owner_org SET NOT NULL;

DROP POLICY "All to api owner" on "channels";
DROP POLICY "Allow api to insert" on "channels";
DROP POLICY "Allow api to update" on "channels";
DROP POLICY "Allow app owner or admin" on "channels";
DROP POLICY "Allow org admins to edit" on "channels";
DROP POLICY "Allow org admins to insert" on "channels";
DROP POLICY "Allow org member's api key to select" on "channels";
DROP POLICY "Allow org member's api key to update" on "channels";
DROP POLICY "Allow org members to select" on "channels";
DROP POLICY "Select if app api" on "channels";

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels"
AS PERMISSIVE FOR UPDATE
TO anon, authenticated
USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels"
AS PERMISSIVE FOR INSERT
TO anon, authenticated
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), owner_org, app_id, NULL));

CREATE POLICY "Allow all for auth (admin+)" ON "public"."channels"
AS PERMISSIVE FOR ALL
TO authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), owner_org, app_id, NULL));

ALTER TABLE channels DROP COLUMN created_by;

-- For compatibility reasons we will readd the user_id
-- But this time it will be nulable + no constraint
-- New cli versions will not set the user_id
ALTER TABLE channels ADD COLUMN 
created_by uuid;

-- channels done


-- Alter orgs
DROP POLICY "Allow member or owner to select" on "orgs";
DROP POLICY "Allow org admin to update (name and logo)" on "orgs";
DROP POLICY "Allow owner to all" on "orgs";

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), id, NULL, NULL));

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), id, NULL, NULL))
WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), id, NULL, NULL));

-- Alter app_versions with new path
ALTER TABLE app_versions ADD COLUMN r2_path character varying;

-- zzz to ensure it runs after "force_valid_owner_org_app_versions"
CREATE TRIGGER zzz_guard_r2_path
   BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW
   EXECUTE PROCEDURE "public"."guard_r2_path"();  


-- Alter images bucket
-- DROP POLICY "All user to manage they own folder 1ffg0oo_3" ON storage.objects;
-- DROP POLICY "All user to manage they own folder 1ffg0oo_2" ON storage.objects;
-- DROP POLICY "All user to manage they own folder 1ffg0oo_1" ON storage.objects;
-- DROP POLICY "All user to manage they own folder 1ffg0oo_0" ON storage.objects;

-- CREATE POLICY "Allow org members to select" 
-- ON storage.objects FOR SELECT 
-- USING ((bucket_id = 'images'::text) AND ("public"."is_member_of_org"(auth.uid(), ((storage.foldername(name))[0])::uuid)) AND storage.filename(name) = 'org-icon');

-- CREATE POLICY "Allow org members to insert" 
-- ON storage.objects FOR INSERT  
-- WITH CHECK ((bucket_id = 'images'::text) AND ("public"."is_member_of_org"(auth.uid(), ((storage.foldername(name))[0])::uuid)) AND storage.filename(name) = 'org-icon');

-- -- (storage.foldername(name))[0]
-- ((bucket_id = 'images'::text) AND ("public"."is_member_of_org"(auth.uid(), (storage.foldername(name))[0])) AND storage.filename(name) = 'org-icon')
