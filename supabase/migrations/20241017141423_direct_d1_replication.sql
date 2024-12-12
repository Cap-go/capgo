-- Create function to handle D1 replication
CREATE OR REPLACE FUNCTION "public"."replicate_to_d1"(
    record jsonb,
    old_record jsonb,
    operation text,
    table_name text
) RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    d1_url TEXT;
    d1_token TEXT;
    query text;
    values_array jsonb[];
    columns_array text[];
    set_clause text;
BEGIN
    -- Get D1 credentials from vault
    SELECT decrypted_secret INTO d1_url FROM vault.decrypted_secrets WHERE name = 'D1_URL';
    SELECT decrypted_secret INTO d1_token FROM vault.decrypted_secrets WHERE name = 'D1_TOKEN';

    -- Clean fields based on table
    IF table_name = 'app_versions' THEN
        record = record - 'minUpdateVersion' - 'native_packages';
        IF record ? 'manifest' THEN
            record = jsonb_set(record, '{manifest}', to_jsonb(record->>'manifest'));
        END IF;
    ELSIF table_name = 'channels' THEN
        record = record - 'secondVersion' - 'secondaryVersionPercentage' - 'disableAutoUpdate';
    ELSIF table_name IN ('channel_devices', 'devices_override') THEN
        record = jsonb_set(record, '{device_id}', to_jsonb(lower(record->>'device_id')));
        record = record - 'device_id_lower';
    END IF;

    -- Build SQL query based on operation
    CASE operation
        WHEN 'INSERT' THEN
            SELECT array_agg(key), array_agg(to_jsonb(value))
            INTO columns_array, values_array
            FROM jsonb_each_text(record);
            
            query = format('INSERT INTO %I (%s) VALUES (%s)',
                table_name,
                array_to_string(columns_array, ', '),
                array_to_string(array_fill('?'::text, ARRAY[array_length(columns_array, 1)]), ', ')
            );

        WHEN 'UPDATE' THEN
            SELECT string_agg(format('%I = ?', key), ', ')
            INTO set_clause
            FROM jsonb_each_text(record);
            
            query = format('UPDATE %I SET %s WHERE id = ?',
                table_name,
                set_clause
            );
            
            values_array = array_append(
                ARRAY(SELECT to_jsonb(value) FROM jsonb_each_text(record)),
                to_jsonb((old_record->>'id'))
            );

        WHEN 'DELETE' THEN
            query = format('DELETE FROM %I WHERE id = ?', table_name);
            values_array = ARRAY[to_jsonb((old_record->>'id'))];
    END CASE;

    -- Make HTTP request to D1
    PERFORM net.http_post(
        url := d1_url,
        headers := jsonb_build_object(
            'Authorization', format('Bearer %s', d1_token),
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
            'sql', query,
            'params', values_array
        )
    );

EXCEPTION WHEN OTHERS THEN
    -- On error, insert into job_queue as failed
    INSERT INTO job_queue (
        job_type,
        status,
        function_type,
        function_name,
        retry_count,
        payload,
        extra_info
    ) VALUES (
        'TRIGGER',
        'failed',
        'cloudflare',
        'replicate_data',
        1,
        jsonb_build_object(
            'record', record,
            'old_record', old_record,
            'type', operation,
            'table', table_name,
            'schema', 'public',
            'retry_count', 1
        )::text,
        jsonb_build_object('error', SQLERRM)
    );
END;
$$; 

-- Replace trigger function to use direct D1 replication
CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_d1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    PERFORM replicate_to_d1(
        to_jsonb(NEW),
        to_jsonb(OLD),
        TG_OP,
        TG_TABLE_NAME
    );
    RETURN NEW;
END;
$$; 

REVOKE ALL ON FUNCTION public.replicate_to_d1 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replicate_to_d1 TO service_role;
