ALTER TABLE public.build_requests
  ADD COLUMN ai_analyzed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.build_requests.ai_analyzed IS
  'Set true after a successful AI analysis of this failed build. Enforces one-analysis-per-job for cost control.';
