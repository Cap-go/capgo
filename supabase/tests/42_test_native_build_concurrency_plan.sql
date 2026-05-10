BEGIN;

SELECT plan(5);

SELECT is(
  (SELECT native_build_concurrency FROM public.plans WHERE name = 'Solo'),
  2,
  'Solo native build concurrency is stored in plans'
);

SELECT is(
  (SELECT native_build_concurrency FROM public.plans WHERE name = 'Maker'),
  3,
  'Maker native build concurrency is stored in plans'
);

SELECT is(
  (SELECT native_build_concurrency FROM public.plans WHERE name = 'Team'),
  4,
  'Team native build concurrency is stored in plans'
);

SELECT is(
  (SELECT native_build_concurrency FROM public.plans WHERE name = 'Enterprise'),
  6,
  'Enterprise native build concurrency is stored in plans'
);

SELECT is(
  (
    SELECT native_build_concurrency
    FROM public.get_current_plan_max_org('22dbad8a-b885-4309-9b3b-a09f8460fb6d')
    LIMIT 1
  ),
  (
    SELECT p.native_build_concurrency
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = '22dbad8a-b885-4309-9b3b-a09f8460fb6d'
    LIMIT 1
  ),
  'get_current_plan_max_org returns native build concurrency'
);

SELECT *
FROM finish();

ROLLBACK;
