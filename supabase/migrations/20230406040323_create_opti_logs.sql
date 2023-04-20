CREATE EXTENSION IF NOT EXISTS TIMESCALEDB WITH SCHEMA extensions;

SELECT create_hypertable('logs', 'created_at');