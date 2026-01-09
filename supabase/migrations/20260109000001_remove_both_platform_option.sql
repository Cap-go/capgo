-- Remove 'both' as a valid platform option from build_requests
-- Platform should only be 'ios' or 'android'

-- First, update any existing records that have 'both' to a default value
-- (there shouldn't be any in production, but just in case)
UPDATE public.build_requests
SET platform = 'ios'
WHERE platform = 'both';

-- Drop the old constraint and add the new one
ALTER TABLE public.build_requests
DROP CONSTRAINT IF EXISTS build_requests_platform_check;

ALTER TABLE public.build_requests
ADD CONSTRAINT build_requests_platform_check
CHECK (platform IN ('ios', 'android'));
