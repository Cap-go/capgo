-- Allow org logo access in images bucket policies
-- Org logos live at: images/org/{org_id}/logo/{file}

-- SELECT
DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    -- Org logos: org/{org_id}/logo/...
    CASE
      WHEN (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[3] = 'logo' THEN
        public.check_min_rights(
          'read'::public.user_min_right,
          public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid
          ),
          ((storage.foldername(name))[2])::uuid,
          NULL::character varying,
          NULL::bigint
        )
      WHEN (storage.foldername(name))[1] = 'org' THEN
        public.check_min_rights(
          'read'::public.user_min_right,
          public.get_identity_org_appid(
            '{read,upload,write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3]
          ),
          ((storage.foldername(name))[2])::uuid,
          (storage.foldername(name))[3],
          NULL::bigint
        )
      ELSE false
    END
    OR (
      -- User avatars stored under user_id/* (allow same org members)
      (storage.foldername(name))[1] <> 'org'
      AND EXISTS (
        SELECT 1
        FROM public.org_users ou
        WHERE ou.user_id::text = (storage.foldername(name))[1]
          AND public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], ou.org_id),
            ou.org_id,
            NULL::character varying,
            NULL::bigint
          )
      )
    )
  )
);

-- INSERT
DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to insert they own folder in images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (
    -- Org logos: org/{org_id}/logo/...
    CASE
      WHEN (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[3] = 'logo' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_allowed(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid
          ),
          ((storage.foldername(name))[2])::uuid,
          NULL::character varying,
          NULL::bigint
        )
      WHEN (storage.foldername(name))[1] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3]
          ),
          ((storage.foldername(name))[2])::uuid,
          (storage.foldername(name))[3],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      -- User avatars: only the owner can write their folder
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[1]
    )
  )
);

-- UPDATE
DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to update they own folder in images"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[3] = 'logo' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_allowed(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid
          ),
          ((storage.foldername(name))[2])::uuid,
          NULL::character varying,
          NULL::bigint
        )
      WHEN (storage.foldername(name))[1] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3]
          ),
          ((storage.foldername(name))[2])::uuid,
          (storage.foldername(name))[3],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[1]
    )
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[3] = 'logo' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_allowed(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid
          ),
          ((storage.foldername(name))[2])::uuid,
          NULL::character varying,
          NULL::bigint
        )
      WHEN (storage.foldername(name))[1] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3]
          ),
          ((storage.foldername(name))[2])::uuid,
          (storage.foldername(name))[3],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[1]
    )
  )
);

-- DELETE
DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to delete they own folder in images"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[3] = 'logo' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_allowed(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid
          ),
          ((storage.foldername(name))[2])::uuid,
          NULL::character varying,
          NULL::bigint
        )
      WHEN (storage.foldername(name))[1] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[2])::uuid,
            (storage.foldername(name))[3]
          ),
          ((storage.foldername(name))[2])::uuid,
          (storage.foldername(name))[3],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[1]
    )
  )
);
