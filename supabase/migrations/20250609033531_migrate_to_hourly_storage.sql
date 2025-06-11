-- Create storage_hourly_cache table
CREATE TABLE storage_hourly_cache (
    id BIGSERIAL PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
    cache JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on app_id for better query performance
CREATE UNIQUE INDEX idx_storage_hourly_cache_app_id ON storage_hourly_cache(app_id);

-- Create index on created_at for time-based queries
CREATE INDEX idx_storage_hourly_cache_created_at ON storage_hourly_cache(created_at);


-- Create storage_hourly table
CREATE TABLE storage_hourly (
    id BIGSERIAL PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    size BIGINT NOT NULL
);

-- Create index on app_id for better query performance
CREATE INDEX idx_storage_hourly_app_id ON storage_hourly(app_id);

-- Create index on date for time-based queries
CREATE INDEX idx_storage_hourly_date ON storage_hourly(date);

-- Create unique index on app_id and date to prevent duplicates
CREATE UNIQUE INDEX idx_storage_hourly_app_id_date ON storage_hourly(app_id, date);

-- Enable RLS for both tables
ALTER TABLE storage_hourly_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_hourly ENABLE ROW LEVEL SECURITY;

UPDATE plans set storage = plans.storage * 31 * 24;
