ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS orgs bigint NOT NULL DEFAULT 0;

ALTER TABLE public.global_stats
ADD COLUMN IF NOT EXISTS completed_shards jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.global_stats.orgs IS 'Total organizations captured by the global stats core shard for this daily snapshot.';

COMMENT ON COLUMN public.global_stats.completed_shards IS 'Global stats shard names that finished updating this daily snapshot.';

UPDATE public.global_stats
SET completed_shards = '["core","usage","revenue","plugins","builds","retention","paid_products","ltv","notifications"]'::jsonb
WHERE completed_shards = '[]'::jsonb;
