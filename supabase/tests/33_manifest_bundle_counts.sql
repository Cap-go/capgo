BEGIN;

CREATE EXTENSION "basejump-supabase_test_helpers";

SELECT
    plan (17);

CREATE TEMP TABLE tmp_manifest_app AS
SELECT
    app_id,
    manifest_bundle_count AS base_count
FROM
    public.apps
WHERE
    app_id = 'com.demo.app';

SELECT
    is (
        (
            SELECT
                COUNT(*)::bigint
            FROM
                tmp_manifest_app
        ),
        1::bigint,
        'Seed app count captured'
    );

SELECT
    is (
        (
            SELECT
                base_count
            FROM
                tmp_manifest_app
        ),
        (
            SELECT
                COUNT(DISTINCT av.id)::bigint
            FROM
                public.app_versions av
            WHERE
                av.app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
                AND EXISTS (
                    SELECT
                        1
                    FROM
                        public.manifest m
                    WHERE
                        m.app_version_id = av.id
                )
        ),
        'Base counter matches existing manifest bundles'
    );

CREATE TEMP TABLE tmp_manifest_rows (id bigint, label text);

CREATE TEMP TABLE tmp_manifest_version AS
WITH
    new_version AS (
        INSERT INTO
            public.app_versions (app_id, name, owner_org)
        SELECT
            app_id,
            concat(
                'manifest-queue-test-',
                floor(
                    extract(
                        epoch
                        FROM
                            clock_timestamp()
                    ) * 1000
                )::text
            ),
            owner_org
        FROM
            public.apps
        WHERE
            app_id = (
                SELECT
                    app_id
                FROM
                    tmp_manifest_app
            )
        LIMIT
            1
        RETURNING
            id
    )
SELECT
    id AS version_id
FROM
    new_version;

SELECT
    ok (
        (
            SELECT
                version_id IS NOT NULL
            FROM
                tmp_manifest_version
        ),
        'Test version inserted'
    );

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count
            FROM
                tmp_manifest_app
        ),
        'Counter unchanged after inserting manifest test version'
    );

WITH
    inserted AS (
        INSERT INTO
            public.manifest (app_version_id, file_name, s3_path, file_hash)
        SELECT
            version_id,
            'manifest-first.js',
            '/tests/manifest-first.js',
            'hash-first'
        FROM
            tmp_manifest_version
        RETURNING
            id,
            'first'::text AS label
    )
INSERT INTO
    tmp_manifest_rows
SELECT
    id,
    label
FROM
    inserted;

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count
            FROM
                tmp_manifest_app
        ),
        'Counter unchanged before queue processing'
    );

SELECT
    ok (
        EXISTS (
            SELECT
                1
            FROM
                pgmq.q_manifest_bundle_counts
            WHERE
                (message ->> 'app_id') = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
                AND (message ->> 'delta')::integer = 1
                AND (message ->> 'app_version_id')::bigint = (
                    SELECT
                        version_id
                    FROM
                        tmp_manifest_version
                )
        ),
        'Insert enqueues +1 delta when version gains manifest'
    );

SELECT
    is (
        public.process_manifest_bundle_counts_queue (10),
        1::bigint,
        'Queue processor applies +1 delta'
    );

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count + 1
            FROM
                tmp_manifest_app
        ),
        'Counter increments after processing'
    );

WITH
    inserted AS (
        INSERT INTO
            public.manifest (app_version_id, file_name, s3_path, file_hash)
        SELECT
            version_id,
            'manifest-second.js',
            '/tests/manifest-second.js',
            'hash-second'
        FROM
            tmp_manifest_version
        RETURNING
            id,
            'second'::text AS label
    )
INSERT INTO
    tmp_manifest_rows
SELECT
    id,
    label
FROM
    inserted;

SELECT
    is (
        (
            SELECT
                COUNT(*)::bigint
            FROM
                pgmq.q_manifest_bundle_counts
            WHERE
                (message ->> 'app_version_id')::bigint = (
                    SELECT
                        version_id
                    FROM
                        tmp_manifest_version
                )
        ),
        0::bigint,
        'Duplicate manifests do not enqueue deltas'
    );

SELECT
    is (
        public.process_manifest_bundle_counts_queue (10),
        0::bigint,
        'Queue processor skips when no messages'
    );

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count + 1
            FROM
                tmp_manifest_app
        ),
        'Counter unchanged when manifest already present'
    );

DELETE FROM public.manifest
WHERE
    id = (
        SELECT
            id
        FROM
            tmp_manifest_rows
        WHERE
            label = 'second'
        LIMIT
            1
    );

SELECT
    is (
        (
            SELECT
                COUNT(*)::bigint
            FROM
                pgmq.q_manifest_bundle_counts
            WHERE
                (message ->> 'app_version_id')::bigint = (
                    SELECT
                        version_id
                    FROM
                        tmp_manifest_version
                )
        ),
        0::bigint,
        'Deleting non-final manifest entry does not enqueue delta'
    );

SELECT
    is (
        public.process_manifest_bundle_counts_queue (10),
        0::bigint,
        'Queue processor idle after non-final delete'
    );

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count + 1
            FROM
                tmp_manifest_app
        ),
        'Counter steady after deleting non-final manifest'
    );

DELETE FROM public.manifest
WHERE
    id = (
        SELECT
            id
        FROM
            tmp_manifest_rows
        WHERE
            label = 'first'
        LIMIT
            1
    );

SELECT
    ok (
        EXISTS (
            SELECT
                1
            FROM
                pgmq.q_manifest_bundle_counts
            WHERE
                (message ->> 'app_id') = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
                AND (message ->> 'delta')::integer = -1
                AND (message ->> 'app_version_id')::bigint = (
                    SELECT
                        version_id
                    FROM
                        tmp_manifest_version
                )
        ),
        'Deleting final manifest enqueues -1 delta'
    );

SELECT
    is (
        public.process_manifest_bundle_counts_queue (10),
        1::bigint,
        'Queue processor applies -1 delta'
    );

SELECT
    is (
        (
            SELECT
                manifest_bundle_count
            FROM
                public.apps
            WHERE
                app_id = (
                    SELECT
                        app_id
                    FROM
                        tmp_manifest_app
                )
        ),
        (
            SELECT
                base_count
            FROM
                tmp_manifest_app
        ),
        'Counter returns to base value'
    );

SELECT
    finish ();

ROLLBACK;
