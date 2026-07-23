-- Fix images bucket INSERT policy left behind during RBAC consolidation.
-- The previous policy compared apps.owner_org/app_id against foldername(apps.name)
-- (display name) instead of the storage object path, which made existence checks
-- unreliable for app-icon uploads during CLI app create.
--
-- Also allow org.create_app on icon UPDATE when the target app is missing or still
-- pending onboarding, so upsert:true during app add/init does not fail RLS for
-- keys that can create apps but lack app.update_settings on the pending row.

DROP POLICY IF EXISTS "Allow user or apikey to insert they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to insert they own folder in images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND (
        (
          EXISTS (
            SELECT 1
            FROM public.apps
            WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
              AND apps.app_id = ((storage.foldername(name))[3])::character varying
          )
          AND public.rbac_check_permission_request(
            public.rbac_perm_app_update_settings(),
            ((storage.foldername(name))[2])::uuid,
            ((storage.foldername(name))[3])::character varying,
            NULL::bigint
          )
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.apps
            WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
              AND apps.app_id = ((storage.foldername(name))[3])::character varying
          )
          AND public.rbac_check_permission_request(
            public.rbac_perm_org_create_app(),
            ((storage.foldername(name))[2])::uuid,
            NULL::character varying,
            NULL::bigint
          )
        )
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
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
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND (
        public.rbac_check_permission_request(
          public.rbac_perm_app_update_settings(),
          ((storage.foldername(name))[2])::uuid,
          ((storage.foldername(name))[3])::character varying,
          NULL::bigint
        )
        OR (
          public.rbac_check_permission_request(
            public.rbac_perm_org_create_app(),
            ((storage.foldername(name))[2])::uuid,
            NULL::character varying,
            NULL::bigint
          )
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.apps
              WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
                AND apps.app_id = ((storage.foldername(name))[3])::character varying
            )
            OR EXISTS (
              SELECT 1
              FROM public.apps
              WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
                AND apps.app_id = ((storage.foldername(name))[3])::character varying
                AND apps.need_onboarding IS TRUE
            )
          )
        )
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
    )
  )
)
WITH CHECK (
  bucket_id = 'images'
  AND (
    (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] IS NOT NULL
      AND (storage.foldername(name))[3] <> 'logo'
      AND (
        public.rbac_check_permission_request(
          public.rbac_perm_app_update_settings(),
          ((storage.foldername(name))[2])::uuid,
          ((storage.foldername(name))[3])::character varying,
          NULL::bigint
        )
        OR (
          public.rbac_check_permission_request(
            public.rbac_perm_org_create_app(),
            ((storage.foldername(name))[2])::uuid,
            NULL::character varying,
            NULL::bigint
          )
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.apps
              WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
                AND apps.app_id = ((storage.foldername(name))[3])::character varying
            )
            OR EXISTS (
              SELECT 1
              FROM public.apps
              WHERE apps.owner_org = ((storage.foldername(name))[2])::uuid
                AND apps.app_id = ((storage.foldername(name))[3])::character varying
                AND apps.need_onboarding IS TRUE
            )
          )
        )
      )
    )
    OR (
      (storage.foldername(name))[1] = 'org'
      AND (storage.foldername(name))[3] = 'logo'
      AND public.rbac_check_permission_request(
        public.rbac_perm_org_update_settings(),
        ((storage.foldername(name))[2])::uuid,
        NULL::character varying,
        NULL::bigint
      )
    )
    OR (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
    )
  )
);
