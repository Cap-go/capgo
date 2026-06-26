-- Remove stripe_info rows left behind when orgs were deleted.
-- Orgs reference stripe_info, so deleting an org never cascaded to stripe_info.

DELETE FROM public.stripe_info AS si
WHERE NOT EXISTS (
  SELECT 1
  FROM public.orgs AS o
  WHERE o.customer_id = si.customer_id
     OR si.customer_id = 'pending_' || o.id::text
);
