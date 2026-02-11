-- Allow app owners to disable device-supplied custom_id persistence coming from
-- unauthenticated telemetry (/stats). Default is true for backward
-- compatibility with existing behavior.

ALTER TABLE IF EXISTS "public"."apps"
  ADD COLUMN IF NOT EXISTS "allow_device_custom_id" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."apps"."allow_device_custom_id"
  IS 'When true, devices can persist custom_id via unauthenticated /stats telemetry. When false, custom_id is ignored and a customIdBlocked stat is emitted.';

-- Server-side stat emitted when custom_id is provided but rejected for the app.
ALTER TYPE "public"."stats_action" ADD VALUE IF NOT EXISTS 'customIdBlocked';
