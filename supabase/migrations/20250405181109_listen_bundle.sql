DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'apps'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.apps;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'app_versions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.app_versions;
    END IF;
END;
$$;
