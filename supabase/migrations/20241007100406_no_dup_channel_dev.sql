BEGIN;

-- Step 1: Delete duplicates while keeping the most recent entry
WITH
  duplicates AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          app_id,
          device_id
        ORDER BY
          created_at DESC
      ) AS row_num
    FROM
      public.channel_devices
  )
DELETE FROM public.channel_devices
WHERE
  id IN (
    SELECT
      id
    FROM
      duplicates
    WHERE
      row_num > 1
  );

-- Step 2: Add the unique constraint if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'channel_devices_app_id_device_id_key'
    ) THEN
        ALTER TABLE public.channel_devices
        ADD CONSTRAINT channel_devices_app_id_device_id_key UNIQUE (app_id, device_id);
    END IF;
END $$;

COMMIT;
