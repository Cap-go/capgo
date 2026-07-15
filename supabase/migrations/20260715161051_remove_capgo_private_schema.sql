-- Keep storage authorization inside the policies so internal helpers do not
-- require a dedicated schema or become callable Data API RPCs.

DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to delete they own folder in apps"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (storage.foldername(name))[1] = COALESCE(
    (SELECT auth.uid())::text,
    public.get_user_id(public.get_apikey_header())::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
      AND public.rbac_check_permission_request(
        public.rbac_perm_bundle_delete(), apps.owner_org, apps.app_id, NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to insert they own folder in apps"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'apps'
  AND (storage.foldername(name))[1] = COALESCE(
    (SELECT auth.uid())::text,
    public.get_user_id(public.get_apikey_header())::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_upload_bundle(), apps.owner_org, apps.app_id, NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in apps"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (storage.foldername(name))[1] = COALESCE(
    (SELECT auth.uid())::text,
    public.get_user_id(public.get_apikey_header())::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read_bundles(), apps.owner_org, apps.app_id, NULL::bigint
      )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in apps" ON storage.objects;
CREATE POLICY "Allow user or apikey to update they own folder in apps"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'apps'
  AND (storage.foldername(name))[1] = COALESCE(
    (SELECT auth.uid())::text,
    public.get_user_id(public.get_apikey_header())::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_upload_bundle(), apps.owner_org, apps.app_id, NULL::bigint
      )
  )
)
WITH CHECK (
  bucket_id = 'apps'
  AND (storage.foldername(name))[1] = COALESCE(
    (SELECT auth.uid())::text,
    public.get_user_id(public.get_apikey_header())::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = ((storage.foldername(name))[2])::character varying
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_upload_bundle(), apps.owner_org, apps.app_id, NULL::bigint
      )
  )
);

DROP FUNCTION IF EXISTS capgo_private.matches_app_storage_rbac_owner(text, character varying, text);
DROP FUNCTION IF EXISTS capgo_private.matches_app_storage_apikey_owner(text, character varying, public.key_mode[]);
DROP SCHEMA IF EXISTS capgo_private;
