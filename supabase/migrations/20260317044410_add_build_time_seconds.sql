-- Add build_time_seconds to build_requests so the frontend can display
-- accurate build durations without relying on updated_at (which gets
-- rewritten on every status poll).
ALTER TABLE "public"."build_requests"
  ADD COLUMN "build_time_seconds" integer;

COMMENT ON COLUMN "public"."build_requests"."build_time_seconds"
  IS 'Actual build duration in seconds, sourced from the builder API (completed_at - started_at). NULL until the build finishes.';
