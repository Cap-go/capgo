-- Make images bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'images';

-- Normalize existing public image URLs to storage paths (backward compatible)
UPDATE public.users
SET image_url = regexp_replace(split_part(image_url, '?', 1), '^.*/storage/v1/object/(public/|sign/)?images/', '')
WHERE image_url IS NOT NULL
  AND image_url ~ '/storage/v1/object/(public/|sign/)?images/';

UPDATE public.orgs
SET logo = regexp_replace(split_part(logo, '?', 1), '^.*/storage/v1/object/(public/|sign/)?images/', '')
WHERE logo IS NOT NULL
  AND logo ~ '/storage/v1/object/(public/|sign/)?images/';

UPDATE public.apps
SET icon_url = regexp_replace(split_part(icon_url, '?', 1), '^.*/storage/v1/object/(public/|sign/)?images/', '')
WHERE icon_url IS NOT NULL
  AND icon_url ~ '/storage/v1/object/(public/|sign/)?images/';

-- Remove overly permissive policy
DROP POLICY IF EXISTS "All all users to act" ON storage.objects;

-- Replace images bucket policies to support private access + org membership
DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    -- App icons: org/{org_id}/{app_id}/...
    CASE
      WHEN (storage.foldername(name))[0] = 'org' THEN
        public.check_min_rights(
          'read'::public.user_min_right,
          public.get_identity_org_appid(
            '{read,upload,write,all}'::public.key_mode[],
            ((storage.foldername(name))[1])::uuid,
            (storage.foldername(name))[2]
          ),
          ((storage.foldername(name))[1])::uuid,
          (storage.foldername(name))[2],
          NULL::bigint
        )
      ELSE false
    END
    OR (
      -- User avatars stored under user_id/* (allow same org members)
      (storage.foldername(name))[0] <> 'org'
      AND EXISTS (
        SELECT 1
        FROM (SELECT auth.uid() AS uid) AS auth_user
        WHERE auth_user.uid IS NOT NULL
          AND (
            auth_user.uid::text = (storage.foldername(name))[0]
            OR EXISTS (
              SELECT 1
              FROM public.org_users ou_self
              JOIN public.org_users ou_target ON ou_self.org_id = ou_target.org_id
              WHERE ou_self.user_id = auth_user.uid
                AND ou_target.user_id::text = (storage.foldername(name))[0]
            )
            OR EXISTS (
              SELECT 1
              FROM public.orgs o
              JOIN public.org_users ou_self ON ou_self.org_id = o.id
              WHERE ou_self.user_id = auth_user.uid
                AND regexp_replace(o.logo, '^.*/storage/v1/object/(public/|sign/)?[^/]+/', '') = name
            )
          )
      )
    )
    OR EXISTS (
      -- Org logo access for API keys (logo stored as path or public URL)
      SELECT 1
      FROM public.orgs o
      WHERE regexp_replace(o.logo, '^.*/storage/v1/object/(public/|sign/)?[^/]+/', '') = name
        AND public.check_min_rights(
          'read'::public.user_min_right,
          public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], o.id),
          o.id,
          NULL::character varying,
          NULL::bigint
        )
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to insert they own folder in images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (
    -- App icons: org/{org_id}/{app_id}/...
    CASE
      WHEN (storage.foldername(name))[0] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[1])::uuid,
            (storage.foldername(name))[2]
          ),
          ((storage.foldername(name))[1])::uuid,
          (storage.foldername(name))[2],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      -- User avatars: only the owner can write their folder
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[0]
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to update they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to update they own folder in images"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[0] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[1])::uuid,
            (storage.foldername(name))[2]
          ),
          ((storage.foldername(name))[1])::uuid,
          (storage.foldername(name))[2],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[0]
    )
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[0] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[1])::uuid,
            (storage.foldername(name))[2]
          ),
          ((storage.foldername(name))[1])::uuid,
          (storage.foldername(name))[2],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[0]
    )
  )
);

DROP POLICY IF EXISTS "Allow user or apikey to delete they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to delete they own folder in images"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'images'
  AND (
    CASE
      WHEN (storage.foldername(name))[0] = 'org' THEN
        public.check_min_rights(
          'write'::public.user_min_right,
          public.get_identity_org_appid(
            '{write,all}'::public.key_mode[],
            ((storage.foldername(name))[1])::uuid,
            (storage.foldername(name))[2]
          ),
          ((storage.foldername(name))[1])::uuid,
          (storage.foldername(name))[2],
          NULL::bigint
        )
      ELSE false
    END
    OR EXISTS (
      SELECT 1
      FROM (SELECT auth.uid() AS uid) AS auth_user
      WHERE auth_user.uid IS NOT NULL
        AND auth_user.uid::text = (storage.foldername(name))[0]
    )
  )
);
