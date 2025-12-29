-- Add RLS policy for cron_tasks table
-- This table has RLS enabled but was missing the policy
-- Only service_role should access this table (service_role bypasses RLS)

CREATE POLICY "Deny all access" ON public.cron_tasks FOR ALL USING (false)
WITH CHECK (false);
