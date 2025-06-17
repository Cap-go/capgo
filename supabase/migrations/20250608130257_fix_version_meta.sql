-- First, let's see what duplicates we have
-- This is just for logging/debugging - you can remove this in production
DO $$ 
BEGIN
  RAISE NOTICE 'Duplicates found: %', (
    SELECT COUNT(*)
    FROM (
      SELECT app_id, version_id, COUNT(*) as cnt
      FROM version_meta 
      GROUP BY app_id, version_id 
      HAVING COUNT(*) > 1
    ) dups
  );
END $$;

-- Create a temporary table with the rows we want to keep
CREATE TEMP TABLE version_meta_keep AS
WITH
  ranked_positive AS (
    -- For positive sizes, rank by timestamp ASC (earliest first)
    SELECT
      timestamp,
      app_id,
      version_id,
      size,
      ROW_NUMBER() OVER (
        PARTITION BY
          app_id,
          version_id
        ORDER BY
          timestamp ASC
      ) as rn
    FROM
      version_meta
    WHERE
      size > 0
  ),
  ranked_negative AS (
    -- For negative sizes, rank by timestamp DESC (latest first)  
    SELECT
      timestamp,
      app_id,
      version_id,
      size,
      ROW_NUMBER() OVER (
        PARTITION BY
          app_id,
          version_id
        ORDER BY
          timestamp DESC
      ) as rn
    FROM
      version_meta
    WHERE
      size < 0
  ),
  zero_sizes AS (
    -- Handle size = 0 case (keep earliest)
    SELECT
      timestamp,
      app_id,
      version_id,
      size,
      ROW_NUMBER() OVER (
        PARTITION BY
          app_id,
          version_id
        ORDER BY
          timestamp ASC
      ) as rn
    FROM
      version_meta
    WHERE
      size = 0
  )
SELECT
  timestamp,
  app_id,
  version_id,
  size
FROM
  ranked_positive
WHERE
  rn = 1
UNION ALL
SELECT
  timestamp,
  app_id,
  version_id,
  size
FROM
  ranked_negative
WHERE
  rn = 1
UNION ALL
SELECT
  timestamp,
  app_id,
  version_id,
  size
FROM
  zero_sizes
WHERE
  rn = 1;

-- Show how many rows we're keeping vs deleting
DO $$ 
DECLARE
  original_count INTEGER;
  keep_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO original_count FROM version_meta;
  SELECT COUNT(*) INTO keep_count FROM version_meta_keep;
  
  RAISE NOTICE 'Original rows: %, Keeping: %, Deleting: %', 
    original_count, keep_count, (original_count - keep_count);
END $$;

-- Delete all rows from version_meta
DELETE FROM version_meta;

-- Insert the deduplicated rows back
INSERT INTO
  version_meta (timestamp, app_id, version_id, size)
SELECT
  timestamp,
  app_id,
  version_id,
  size
FROM
  version_meta_keep;

-- Drop the temp table
DROP TABLE version_meta_keep;

-- Create partial unique constraints - one for positive sizes, one for negative sizes
-- This allows both positive and negative entries for the same (app_id, version_id)
-- but prevents duplicate positive or duplicate negative entries
CREATE UNIQUE INDEX unique_app_version_positive ON version_meta (app_id, version_id)
WHERE
  size > 0;

CREATE UNIQUE INDEX unique_app_version_negative ON version_meta (app_id, version_id)
WHERE
  size < 0;

-- Create a secure function to handle version_meta upserts
-- Only available to supabase service role, not public users
CREATE OR REPLACE FUNCTION upsert_version_meta (
  p_app_id VARCHAR(255),
  p_version_id BIGINT,
  p_size BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER -- Run with definer's privileges (postgres/service role)
SET
  search_path = 'public' -- Security: fix search path
  AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- Check if a row already exists for this app_id, version_id with same sign
  IF p_size > 0 THEN
    -- Check for existing positive size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta 
    WHERE public.version_meta.app_id = p_app_id 
      AND public.version_meta.version_id = p_version_id 
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    -- Check for existing negative size
    SELECT COUNT(*) INTO existing_count
    FROM public.version_meta 
    WHERE public.version_meta.app_id = p_app_id 
      AND public.version_meta.version_id = p_version_id 
      AND public.version_meta.size < 0;
  END IF;

  -- If row already exists, do nothing and return false
  IF existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  -- Insert the new row
  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (p_app_id, p_version_id, p_size);
  
  -- Return true to indicate insertion happened
  RETURN TRUE;
  
EXCEPTION
  WHEN unique_violation THEN
    -- If there's a race condition and constraint is violated, just return false
    RETURN FALSE;
END;
$$;

-- Revoke public access and grant only to service role
REVOKE ALL ON FUNCTION upsert_version_meta (VARCHAR(255), BIGINT, BIGINT)
FROM
  PUBLIC;

GRANT
EXECUTE ON FUNCTION upsert_version_meta (VARCHAR(255), BIGINT, BIGINT) TO service_role;

-- Verify the deduplication worked
DO $$ 
BEGIN
  RAISE NOTICE 'Final row count: %', (SELECT COUNT(*) FROM version_meta);
  RAISE NOTICE 'Positive duplicates: %', (
    SELECT COUNT(*)
    FROM (
      SELECT app_id, version_id, COUNT(*) as cnt
      FROM version_meta 
      WHERE size > 0
      GROUP BY app_id, version_id 
      HAVING COUNT(*) > 1
    ) dups
  );
  RAISE NOTICE 'Negative duplicates: %', (
    SELECT COUNT(*)
    FROM (
      SELECT app_id, version_id, COUNT(*) as cnt
      FROM version_meta 
      WHERE size < 0
      GROUP BY app_id, version_id 
      HAVING COUNT(*) > 1
    ) dups
  );
END $$;
