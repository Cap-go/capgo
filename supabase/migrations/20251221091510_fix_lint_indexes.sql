CREATE INDEX IF NOT EXISTS idx_build_logs_user_id
ON public.build_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_build_requests_requested_by
ON public.build_requests (requested_by);
