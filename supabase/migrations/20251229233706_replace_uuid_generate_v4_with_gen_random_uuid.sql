-- Migration: Replace extensions.uuid_generate_v4() with gen_random_uuid()
--
-- gen_random_uuid() is:
-- - Built-in since PostgreSQL 13 (no extension needed)
-- - ~3.5x faster than uuid_generate_v4()
-- - Functionally equivalent (both generate UUID v4)
-- - Recommended by PostgreSQL documentation

-- Update apps table
ALTER TABLE "public"."apps"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update build_logs table
ALTER TABLE "public"."build_logs"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update build_requests table
ALTER TABLE "public"."build_requests"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update deleted_account table
ALTER TABLE "public"."deleted_account"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update plans table
ALTER TABLE "public"."plans"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update usage_credit_grants table
ALTER TABLE "public"."usage_credit_grants"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Update usage_overage_events table
ALTER TABLE "public"."usage_overage_events"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

DROP EXTENSION IF EXISTS "uuid-ossp";
