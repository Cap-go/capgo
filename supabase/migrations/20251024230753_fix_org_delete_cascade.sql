-- Drop the existing foreign key constraint for app_metrics_cache
ALTER TABLE public.app_metrics_cache
DROP CONSTRAINT IF EXISTS app_metrics_cache_org_id_fkey;

-- Add it back with ON DELETE CASCADE
ALTER TABLE public.app_metrics_cache
ADD CONSTRAINT app_metrics_cache_org_id_fkey FOREIGN KEY (
    org_id
) REFERENCES public.orgs (id) ON DELETE CASCADE;

-- Drop the existing foreign key constraint for tmp_users
ALTER TABLE public.tmp_users
DROP CONSTRAINT IF EXISTS tmp_users_org_id_fkey;

-- Add it back with ON DELETE CASCADE
ALTER TABLE public.tmp_users
ADD CONSTRAINT tmp_users_org_id_fkey FOREIGN KEY (
    org_id
) REFERENCES public.orgs (id) ON DELETE CASCADE;
