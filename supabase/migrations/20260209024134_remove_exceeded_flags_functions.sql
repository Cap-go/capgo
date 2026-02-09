-- Remove deprecated exceeded-flag RPC helpers; backend now updates stripe_info directly
-- via service_role and customer_id.

DROP FUNCTION IF EXISTS "public"."set_mau_exceeded_by_org"(uuid, boolean);
DROP FUNCTION IF EXISTS "public"."set_storage_exceeded_by_org"(uuid, boolean);
DROP FUNCTION IF EXISTS "public"."set_bandwidth_exceeded_by_org"(uuid, boolean);
