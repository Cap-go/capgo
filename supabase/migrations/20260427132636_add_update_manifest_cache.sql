CREATE TABLE IF NOT EXISTS public.app_version_manifest_cache (
    app_version_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT app_version_manifest_cache_pkey PRIMARY KEY (app_version_id),
    CONSTRAINT app_version_manifest_cache_app_version_id_fkey
    FOREIGN KEY (app_version_id)
    REFERENCES public.app_versions (id)
    ON DELETE CASCADE,
    CONSTRAINT app_version_manifest_cache_entries_is_array
    CHECK (jsonb_typeof(entries) = 'array')
);

ALTER TABLE public.app_version_manifest_cache OWNER TO postgres;
ALTER TABLE ONLY public.app_version_manifest_cache REPLICA IDENTITY FULL;

COMMENT ON TABLE public.app_version_manifest_cache IS
'Internal precomputed manifest payload used by the /updates hot path
to avoid aggregating manifest rows per request.';
COMMENT ON COLUMN public.app_version_manifest_cache.entries IS
'Compact manifest payload served by /updates. Each entry stores
file_name, file_hash, and s3_path.';

REVOKE ALL ON TABLE public.app_version_manifest_cache FROM public;
REVOKE ALL ON TABLE public.app_version_manifest_cache FROM anon;
REVOKE ALL ON TABLE public.app_version_manifest_cache FROM authenticated;
GRANT ALL ON TABLE public.app_version_manifest_cache TO service_role;

ALTER TABLE public.app_version_manifest_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'planetscale_replicate'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'planetscale_replicate'
      AND schemaname = 'public'
      AND tablename = 'app_version_manifest_cache'
  ) THEN
    ALTER PUBLICATION "planetscale_replicate" ADD TABLE ONLY public.app_version_manifest_cache;
  END IF;
END;
$$;

INSERT INTO public.manifest (
    app_version_id,
    file_name,
    s3_path,
    file_hash,
    file_size
)
SELECT
    av.id,
    manifest_entry.file_name,
    manifest_entry.s3_path,
    manifest_entry.file_hash,
    0 AS file_size
FROM public.app_versions AS av
CROSS JOIN
    LATERAL unnest(av.manifest) WITH ORDINALITY
        AS manifest_entry (file_name, s3_path, file_hash, ordinality)
WHERE
    av.manifest IS NOT NULL
    AND manifest_entry.file_name IS NOT NULL
    AND manifest_entry.s3_path IS NOT NULL
    AND manifest_entry.file_hash IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM public.manifest AS manifest_row
        WHERE manifest_row.app_version_id = av.id
    );

INSERT INTO public.app_version_manifest_cache (app_version_id, entries)
SELECT
    m.app_version_id,
    jsonb_agg(
        jsonb_build_object(
            'file_name', m.file_name,
            'file_hash', m.file_hash,
            's3_path', m.s3_path
        )
        ORDER BY m.id
    ) AS entries
FROM public.manifest AS m
GROUP BY m.app_version_id
ON CONFLICT (app_version_id) DO UPDATE
    SET
        entries = excluded.entries,
        updated_at = now();

UPDATE public.app_versions AS av
SET manifest = NULL
WHERE
    av.manifest IS NOT NULL
    AND (
        EXISTS (
            SELECT 1
            FROM public.app_version_manifest_cache AS manifest_cache
            WHERE manifest_cache.app_version_id = av.id
        )
        OR coalesce(array_length(av.manifest, 1), 0) = 0
    );

UPDATE public.app_versions AS av
SET manifest_count = coalesce(manifest_cache.manifest_count, 0)
FROM (
    SELECT
        app_version.id,
        coalesce(
            jsonb_array_length(manifest_cache.entries),
            0
        ) AS manifest_count
    FROM public.app_versions AS app_version
    LEFT JOIN public.app_version_manifest_cache AS manifest_cache
        ON app_version.id = manifest_cache.app_version_id
) AS manifest_cache
WHERE
    av.id = manifest_cache.id
    AND av.manifest_count IS DISTINCT FROM manifest_cache.manifest_count;

UPDATE public.apps AS app
SET
    manifest_bundle_count = app_cache.bundle_count,
    updated_at = now()
FROM (
    SELECT
        app_inner.app_id,
        count(cache_inner.app_version_id) FILTER (
            WHERE app_version.deleted = FALSE
        )::bigint AS bundle_count
    FROM public.apps AS app_inner
    LEFT JOIN public.app_versions AS app_version
        ON app_inner.app_id = app_version.app_id
    LEFT JOIN public.app_version_manifest_cache AS cache_inner
        ON app_version.id = cache_inner.app_version_id
    GROUP BY app_inner.app_id
) AS app_cache
WHERE
    app.app_id = app_cache.app_id
    AND app.manifest_bundle_count IS DISTINCT FROM app_cache.bundle_count;
