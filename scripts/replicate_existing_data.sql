-- Replicate existing channel_devices data into job_queue
INSERT INTO job_queue (job_type, payload, function_name, function_type)
SELECT 
    'TRIGGER',
    jsonb_build_object(
        'old_record', NULL,
        'record', to_jsonb(cd.*),
        'type', 'INSERT',
        'table', 'channel_devices',
        'schema', 'public',
        'retry_count', 0
    )::text,
    'replicate_data',
    'cloudflare'
FROM channel_devices cd; 

-- Replicate all existing apps
SELECT replicate_to_d1(
    to_jsonb(a.*),
    NULL,
    'INSERT',
    'apps'
)
FROM apps a;

-- Replicate all existing app_versions
SELECT replicate_to_d1(
    to_jsonb(av.*),
    NULL,
    'INSERT',
    'app_versions'
)
FROM app_versions av;

-- Replicate all existing channels
SELECT replicate_to_d1(
    to_jsonb(c.*),
    NULL,
    'INSERT',
    'channels'
)
FROM channels c;

-- Replicate all existing channel_devices
SELECT replicate_to_d1(
    to_jsonb(cd.*),
    NULL,
    'INSERT',
    'channel_devices'
)
FROM channel_devices cd;

-- Replicate all existing devices_override
SELECT replicate_to_d1(
    to_jsonb(d.*),
    NULL,
    'INSERT',
    'devices_override'
)
FROM devices_override d;

-- Replicate all existing orgs
SELECT replicate_to_d1(
    to_jsonb(o.*),
    NULL,
    'INSERT',
    'orgs'
)
FROM orgs o; 
