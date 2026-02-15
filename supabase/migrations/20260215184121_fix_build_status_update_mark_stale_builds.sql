UPDATE public.build_requests
SET
    status = 'failed',
    last_error = 'Build timed out (stale for over 1 hour)',
    updated_at = NOW()
WHERE
    status IN ('pending', 'running', 'in_progress')
    AND updated_at < NOW() - INTERVAL '1 hour';
