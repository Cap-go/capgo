-- Migration file: improve_channel_devices_table.sql

-- First, drop the existing primary key
ALTER TABLE public.channel_devices 
DROP CONSTRAINT channel_devices_pkey;

-- Then, add the new primary key on the 'id' column
ALTER TABLE public.channel_devices 
ADD CONSTRAINT channel_devices_pkey PRIMARY KEY (id);


-- Step 1: Remove the existing primary key constraint
ALTER TABLE "public"."channel_devices" DROP CONSTRAINT IF EXISTS "channel_devices_pkey";

-- Step 2: Add a new composite primary key
ALTER TABLE "public"."channel_devices"
ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("app_id", "device_id");

-- Step 3: Remove the existing index if it exists
DROP INDEX IF EXISTS "idx_app_id_device_id_channel_devices";

-- Step 4: Create a new unique index on (app_id, device_id, channel_id)
CREATE UNIQUE INDEX "idx_app_id_device_id_channel_id_channel_devices" 
ON "public"."channel_devices" ("app_id", "device_id", "channel_id");

