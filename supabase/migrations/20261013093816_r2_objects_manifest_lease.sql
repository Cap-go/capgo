-- Schema preparation only; reservations and cleanup do not use this field yet.
-- Deploy separately to the standalone PlanetScale inventory as documented in
-- docs/r2-inventory-operations.md (with a concurrent index build there).
ALTER TABLE public.r2_objects
ADD COLUMN manifest_lease_expires_at timestamptz;

COMMENT ON COLUMN public.r2_objects.manifest_lease_expires_at IS
'Expiry for future manifest upload reservations and cleanup; '
'NULL means no lease. Future reservations extend it with '
'GREATEST(COALESCE(existing_expiry, database_now), '
'database_now + interval ''30 minutes'').';

CREATE INDEX r2_objects_expired_manifest_leases_idx
ON public.r2_objects (bucket_name, manifest_lease_expires_at, r2_key)
WHERE r2_state = 'to_be_uploaded'::public.r2_object_state
AND manifest_lease_expires_at IS NOT NULL;
