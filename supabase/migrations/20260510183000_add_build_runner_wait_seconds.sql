ALTER TABLE public.build_requests
ADD COLUMN IF NOT EXISTS runner_wait_seconds bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.build_requests.runner_wait_seconds IS 'Self-hosted runner wait time reported by builder, in seconds. Informational only; not used for billing.';
