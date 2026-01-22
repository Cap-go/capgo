-- Add Electron platform support
-- This migration adds 'electron' as a supported platform across the system

-- Step 1: Add 'electron' to the platform_os enum
ALTER TYPE "public"."platform_os" ADD VALUE IF NOT EXISTS 'electron';

-- Step 2: Add electron column to channels table
ALTER TABLE "public"."channels" ADD COLUMN IF NOT EXISTS "electron" boolean DEFAULT true NOT NULL;

-- Step 3: Create index for electron channel queries (similar to ios/android indexes)
CREATE INDEX IF NOT EXISTS "idx_channels_public_app_id_electron" ON "public"."channels" USING btree ("public", "app_id", "electron");

-- Step 4: Update build_requests platform check constraint to include 'electron'
ALTER TABLE "public"."build_requests" DROP CONSTRAINT IF EXISTS "build_requests_platform_check";
ALTER TABLE "public"."build_requests" ADD CONSTRAINT "build_requests_platform_check" CHECK ((("platform")::text = ANY (ARRAY[('ios'::character varying)::text, ('android'::character varying)::text, ('both'::character varying)::text, ('electron'::character varying)::text])));

-- Step 5: Update build_logs platform check constraint to include 'electron'
ALTER TABLE "public"."build_logs" DROP CONSTRAINT IF EXISTS "build_logs_platform_check";
ALTER TABLE "public"."build_logs" ADD CONSTRAINT "build_logs_platform_check" CHECK ((("platform")::text = ANY (ARRAY[('ios'::character varying)::text, ('android'::character varying)::text, ('electron'::character varying)::text])));

-- Step 6: Add 'disablePlatformElectron' to stats_action enum
ALTER TYPE "public"."stats_action" ADD VALUE IF NOT EXISTS 'disablePlatformElectron';

-- Note: Most platform validation happens in the backend code, so this is mainly for database-level constraints
