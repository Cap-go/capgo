-- Function to check if string is numeric
CREATE OR REPLACE FUNCTION is_numeric(text) RETURNS boolean AS $$
BEGIN
    RETURN $1 ~ '^[0-9]+$';
END;
$$ LANGUAGE plpgsql;

-- Function to parse cron field
CREATE OR REPLACE FUNCTION parse_cron_field(field text, current_val int, max_val int) 
RETURNS int AS $$
BEGIN
    IF field = '*' THEN
        RETURN current_val;
    ELSIF is_numeric(field) THEN
        RETURN field::int;
    ELSIF field LIKE '*/%' THEN
        DECLARE
            step int := regexp_replace(field, '\*/(\d+)', '\1')::int;
            next_val int := current_val + (step - (current_val % step));
        BEGIN
            IF next_val >= max_val THEN
                RETURN step;
            ELSE
                RETURN next_val;
            END IF;
        END;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Parse */n pattern
CREATE OR REPLACE FUNCTION parse_step_pattern(pattern text)
RETURNS int AS $$
BEGIN
    RETURN (regexp_replace(pattern, '\*/(\d+)', '\1'))::int;
END;
$$ LANGUAGE plpgsql;

-- Get next value for a field
CREATE OR REPLACE FUNCTION get_next_cron_value(pattern text, current_val int, max_val int)
RETURNS int AS $$
DECLARE
    next_val int;
BEGIN
    IF pattern = '*' THEN
        RETURN current_val;
    ELSIF pattern LIKE '*/%' THEN
        DECLARE
            step int := parse_step_pattern(pattern);
            temp_next int := current_val + (step - (current_val % step));
        BEGIN
            IF temp_next >= max_val THEN
                RETURN step;
            ELSE
                RETURN temp_next;
            END IF;
        END;
    ELSE
        RETURN pattern::int;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Calculate next run time
CREATE OR REPLACE FUNCTION get_next_cron_time(p_schedule text, p_timestamp timestamp with time zone)
RETURNS timestamp with time zone AS $$
DECLARE
    parts text[];
    minute_pattern text;
    hour_pattern text;
    day_pattern text;
    month_pattern text;
    dow_pattern text;
    next_minute int;
    next_hour int;
    next_time timestamp with time zone;
BEGIN
    -- Split cron expression
    parts := regexp_split_to_array(p_schedule, '\s+');
    minute_pattern := parts[1];
    hour_pattern := parts[2];
    day_pattern := parts[3];
    month_pattern := parts[4];
    dow_pattern := parts[5];

    -- Get next minute and hour
    next_minute := get_next_cron_value(
        minute_pattern,
        EXTRACT(MINUTE FROM p_timestamp)::int,
        60
    );
    next_hour := get_next_cron_value(
        hour_pattern,
        EXTRACT(HOUR FROM p_timestamp)::int,
        24
    );

    -- Calculate base next time
    next_time := date_trunc('hour', p_timestamp) + 
                 make_interval(hours => next_hour - EXTRACT(HOUR FROM p_timestamp)::int,
                             mins => next_minute);

    -- Ensure next_time is in the future
    IF next_time <= p_timestamp THEN
        IF hour_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(hours => parse_step_pattern(hour_pattern));
        ELSIF minute_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(mins => parse_step_pattern(minute_pattern));
        ELSE
            next_time := next_time + interval '1 day';
        END IF;
    END IF;

    RETURN next_time;
END;
$$ LANGUAGE plpgsql;

SELECT cron.unschedule('process_cron_stats_jobs');

SELECT cron.schedule(
    'process_cron_stats_jobs',
    '0 */2 * * *',
    $$SELECT process_cron_stats_jobs();$$
);

-- Parse */n pattern
CREATE OR REPLACE FUNCTION parse_step_pattern(pattern text)
RETURNS int AS $$
BEGIN
    RETURN (regexp_replace(pattern, '\*/(\d+)', '\1'))::int;
END;
$$ LANGUAGE plpgsql;

-- Get next value for a field
CREATE OR REPLACE FUNCTION get_next_cron_value(pattern text, current_val int, max_val int)
RETURNS int AS $$
DECLARE
    next_val int;
BEGIN
    IF pattern = '*' THEN
        RETURN current_val;
    ELSIF pattern LIKE '*/%' THEN
        DECLARE
            step int := parse_step_pattern(pattern);
            temp_next int := current_val + (step - (current_val % step));
        BEGIN
            IF temp_next >= max_val THEN
                RETURN step;
            ELSE
                RETURN temp_next;
            END IF;
        END;
    ELSE
        RETURN pattern::int;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Calculate next run time
CREATE OR REPLACE FUNCTION get_next_cron_time(p_schedule text, p_timestamp timestamp with time zone)
RETURNS timestamp with time zone AS $$
DECLARE
    parts text[];
    minute_pattern text;
    hour_pattern text;
    day_pattern text;
    month_pattern text;
    dow_pattern text;
    next_minute int;
    next_hour int;
    next_time timestamp with time zone;
BEGIN
    -- Split cron expression
    parts := regexp_split_to_array(p_schedule, '\s+');
    minute_pattern := parts[1];
    hour_pattern := parts[2];
    day_pattern := parts[3];
    month_pattern := parts[4];
    dow_pattern := parts[5];

    -- Get next minute and hour
    next_minute := get_next_cron_value(
        minute_pattern,
        EXTRACT(MINUTE FROM p_timestamp)::int,
        60
    );
    next_hour := get_next_cron_value(
        hour_pattern,
        EXTRACT(HOUR FROM p_timestamp)::int,
        24
    );

    -- Calculate base next time
    next_time := date_trunc('hour', p_timestamp) + 
                 make_interval(hours => next_hour - EXTRACT(HOUR FROM p_timestamp)::int,
                             mins => next_minute);

    -- Ensure next_time is in the future
    IF next_time <= p_timestamp THEN
        IF hour_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(hours => parse_step_pattern(hour_pattern));
        ELSIF minute_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(mins => parse_step_pattern(minute_pattern));
        ELSE
            next_time := next_time + interval '1 day';
        END IF;
    END IF;

    RETURN next_time;
END;
$$ LANGUAGE plpgsql;

-- Main function to get stats job info
CREATE OR REPLACE FUNCTION get_process_cron_stats_job_info()
RETURNS TABLE (last_run timestamp with time zone, next_run timestamp with time zone) SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH last_run AS (
        SELECT start_time
        FROM cron.job_run_details
        WHERE command = 'SELECT process_cron_stats_jobs();'
        AND status = 'succeeded'
        ORDER BY start_time DESC
        LIMIT 1
    ),
    job_info AS (
        SELECT schedule
        FROM cron.job
        WHERE jobname = 'process_cron_stats_jobs'
    )
    SELECT 
        COALESCE(last_run.start_time, CURRENT_TIMESTAMP - INTERVAL '1 day') AS last_run,
        get_next_cron_time(job_info.schedule, CURRENT_TIMESTAMP) AS next_run
    FROM job_info
    LEFT JOIN last_run ON true;
END;
$$ LANGUAGE plpgsql; 
