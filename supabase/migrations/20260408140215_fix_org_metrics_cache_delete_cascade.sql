-- Ensure org metrics cache rows never block organization deletion.
ALTER TABLE public.org_metrics_cache
DROP CONSTRAINT IF EXISTS org_metrics_cache_org_id_fkey;

ALTER TABLE public.org_metrics_cache
ADD CONSTRAINT org_metrics_cache_org_id_fkey FOREIGN KEY (
    org_id
) REFERENCES public.orgs (id) ON DELETE CASCADE;
