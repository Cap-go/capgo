-- Store object sizes observed by the upload backend. The manifest payload stays
-- client-provided, but manifest.file_size is hydrated only from this table.
CREATE TABLE IF NOT EXISTS public.uploaded_file_sizes (
    s3_path text PRIMARY KEY,
    file_size bigint NOT NULL CHECK (file_size > 0),
    owner_org uuid NOT NULL,
    app_id character varying NOT NULL,
    created_at timestamp with time zone DEFAULT NOW() NOT NULL,
    updated_at timestamp with time zone DEFAULT NOW() NOT NULL
);

ALTER TABLE public.uploaded_file_sizes OWNER TO postgres;
ALTER TABLE public.uploaded_file_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny select on uploaded_file_sizes" ON public.uploaded_file_sizes;
CREATE POLICY "Deny select on uploaded_file_sizes"
ON public.uploaded_file_sizes
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (false);

DROP POLICY IF EXISTS "Deny insert on uploaded_file_sizes" ON public.uploaded_file_sizes;
CREATE POLICY "Deny insert on uploaded_file_sizes"
ON public.uploaded_file_sizes
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny update on uploaded_file_sizes" ON public.uploaded_file_sizes;
CREATE POLICY "Deny update on uploaded_file_sizes"
ON public.uploaded_file_sizes
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny delete on uploaded_file_sizes" ON public.uploaded_file_sizes;
CREATE POLICY "Deny delete on uploaded_file_sizes"
ON public.uploaded_file_sizes
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);

REVOKE ALL ON TABLE public.uploaded_file_sizes FROM PUBLIC;
REVOKE ALL ON TABLE public.uploaded_file_sizes FROM anon;
REVOKE ALL ON TABLE public.uploaded_file_sizes FROM authenticated;
GRANT ALL ON TABLE public.uploaded_file_sizes TO service_role;

CREATE INDEX IF NOT EXISTS uploaded_file_sizes_owner_org_app_id_idx
ON public.uploaded_file_sizes (owner_org, app_id);

-- Backend-observed uploads set manifest.file_size before insert, so avoid
-- queuing only rows that match the service-role-only observed size table.
-- Legacy/missing or forged records still keep the fallback R2 HEAD.
CREATE OR REPLACE FUNCTION public.trigger_verified_manifest_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    payload jsonb;
BEGIN
    IF NEW.file_size IS NOT NULL
        AND NEW.file_size > 0
        AND EXISTS (
            SELECT 1
            FROM public.uploaded_file_sizes u
            WHERE u.s3_path = NEW.s3_path
                AND u.file_size = NEW.file_size
        )
    THEN
        RETURN NEW;
    END IF;

    payload := jsonb_build_object(
        'function_name', 'on_manifest_create',
        'function_type', NULL,
        'payload', jsonb_build_object(
            'old_record', OLD,
            'record', NEW,
            'type', TG_OP,
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
        )
    );

    PERFORM pgmq.send('on_manifest_create', payload);
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trigger_verified_manifest_create() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trigger_verified_manifest_create() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_verified_manifest_create() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_verified_manifest_create() FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_verified_manifest_create() FROM service_role;

DROP TRIGGER IF EXISTS on_manifest_create ON public.manifest;

CREATE TRIGGER on_manifest_create
AFTER INSERT ON public.manifest
FOR EACH ROW
EXECUTE FUNCTION public.trigger_verified_manifest_create();
