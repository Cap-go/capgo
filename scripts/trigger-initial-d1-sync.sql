-- Trigger initial D1 sync by queueing all existing data to PGMQ
-- This mimics production behavior where triggers send changes to the queue

-- 1. app_versions
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(av.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'app_versions'
        ) AS msg
    FROM public.app_versions
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 2. channels
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(c.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'channels'
        ) AS msg
    FROM public.channels
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 3. channel_devices
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(cd.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'channel_devices'
        ) AS msg
    FROM public.channel_devices
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 4. apps
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(a.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'apps'
        ) AS msg
    FROM public.apps
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 5. orgs
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(o.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'orgs'
        ) AS msg
    FROM public.orgs
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 6. stripe_info
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(si.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'stripe_info'
        ) AS msg
    FROM public.stripe_info
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- 7. manifest
WITH payloads AS (
    SELECT
        jsonb_build_object(
            'record', to_jsonb(m.*),
            'old_record', '{}',
            'type', 'INSERT',
            'table', 'manifest'
        ) AS msg
    FROM public.manifest
),

batched AS (
    SELECT array_agg(msg) AS msgs FROM payloads
)

SELECT count(*) AS messages_sent
FROM pgmq.send_batch(
    queue_name => 'replicate_data',
    msgs => (SELECT msgs FROM batched)
);

-- Show queue size
SELECT
    queue_name,
    queue_length,
    newest_msg_age_sec,
    oldest_msg_age_sec,
    total_messages
FROM pgmq.metrics('replicate_data');
