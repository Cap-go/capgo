-- Allow shared signed images under images/public/*
-- This extends the current private images bucket RLS without changing the
-- existing app-icon, org-logo, or user-avatar ownership rules.
-- Intended use case: store shared defaults like images/public/capgo.png once
-- and let any client with anon/authenticated access create a signed URL.

-- SELECT
DROP POLICY IF EXISTS "Allow user or apikey to read they own folder in images" ON storage.objects;
CREATE POLICY "Allow user or apikey to read they own folder in images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
    bucket_id = 'images'
    AND (
    -- Shared images: public/...
        (storage.foldername(name))[1] = 'public'
        OR (
            -- App icons: org/{org_id}/{app_id}/...
            CASE
                WHEN
                    (storage.foldername(name))[1] = 'org'
                    AND (storage.foldername(name))[3] IS NOT NULL
                    AND (storage.foldername(name))[3] <> 'logo'
                    THEN
                        public.check_min_rights(
                            'read'::public.user_min_right,
                            public.get_identity_org_appid(
                                '{read,upload,write,all}'::public.key_mode [],
                                ((storage.foldername(name))[2])::uuid,
                                (storage.foldername(name))[3]
                            ),
                            ((storage.foldername(name))[2])::uuid,
                            (storage.foldername(name))[3],
                            NULL::bigint
                        )
                ELSE FALSE
            END
        )
        OR (
            -- Org logos: org/{org_id}/logo/...
            (storage.foldername(name))[1] = 'org'
            AND (storage.foldername(name))[3] = 'logo'
            AND public.check_min_rights(
                'read'::public.user_min_right,
                public.get_identity_org_allowed(
                    '{read,upload,write,all}'::public.key_mode [],
                    ((storage.foldername(name))[2])::uuid
                ),
                ((storage.foldername(name))[2])::uuid,
                NULL::character varying,
                NULL::bigint
            )
        )
        OR (
            -- User avatars stored under user_id/* (allow same org members)
            (storage.foldername(name))[1] <> 'org'
            AND (storage.foldername(name))[1] <> 'public'
            AND EXISTS (
                SELECT 1
                FROM public.org_users AS ou
                WHERE
                    ou.user_id::text
                    = (storage.foldername(storage.objects.name))[1]
                    AND public.check_min_rights(
                        'read'::public.user_min_right,
                        public.get_identity_org_allowed(
                            '{read,upload,write,all}'::public.key_mode [],
                            ou.org_id
                        ),
                        ou.org_id,
                        NULL::character varying,
                        NULL::bigint
                    )
            )
        )
    )
);
