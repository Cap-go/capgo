-- Standard Webhooks compatibility and API-only table access.

ALTER TABLE public.webhooks
ALTER COLUMN secret SET DEFAULT (
    'whsec_'::text || encode(extensions.gen_random_bytes(32), 'base64')
);

COMMENT ON COLUMN public.webhooks.secret IS
'Standard Webhooks HMAC-SHA256 secret in whsec_ base64 format.';

ALTER TABLE public.webhooks
ADD COLUMN IF NOT EXISTS delivery_version text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.webhooks
DROP CONSTRAINT IF EXISTS webhooks_delivery_version_check;

ALTER TABLE public.webhooks
ADD CONSTRAINT webhooks_delivery_version_check
CHECK (delivery_version ~ '^(legacy|standard)$');

COMMENT ON COLUMN public.webhooks.delivery_version IS
'Webhook delivery format version. legacy preserves existing Capgo payloads; standard uses Standard Webhooks payload and headers.';

ALTER TABLE public.webhook_deliveries
ADD COLUMN IF NOT EXISTS delivery_version text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.webhook_deliveries
DROP CONSTRAINT IF EXISTS webhook_deliveries_delivery_version_check;

ALTER TABLE public.webhook_deliveries
ADD CONSTRAINT webhook_deliveries_delivery_version_check
CHECK (delivery_version ~ '^(legacy|standard)$');

COMMENT ON COLUMN public.webhook_deliveries.delivery_version IS
'Delivery format version used for this webhook attempt.';

ALTER TABLE public.webhook_deliveries
ALTER COLUMN max_attempts SET DEFAULT 10;

UPDATE public.webhook_deliveries
SET max_attempts = 10
WHERE status = 'pending'
  AND (max_attempts IS NULL OR max_attempts < 10);

-- Webhook secrets and delivery payloads must be accessed only through the API.
-- Service-role jobs keep access for dispatch, delivery, and API handlers.
REVOKE ALL ON TABLE public.webhooks FROM anon;
REVOKE ALL ON TABLE public.webhooks FROM authenticated;
REVOKE ALL ON TABLE public.webhooks FROM public;
GRANT ALL ON TABLE public.webhooks TO service_role;

REVOKE ALL ON TABLE public.webhook_deliveries FROM anon;
REVOKE ALL ON TABLE public.webhook_deliveries FROM authenticated;
REVOKE ALL ON TABLE public.webhook_deliveries FROM public;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;

DROP POLICY IF EXISTS "Allow org members to select webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to select webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to insert webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to update webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Allow admin to delete webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Deny direct select on webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Deny direct insert on webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Deny direct update on webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS "Deny direct delete on webhooks" -- noqa: RF05
ON public.webhooks;
DROP POLICY IF EXISTS deny_direct_select_on_webhooks ON public.webhooks;
DROP POLICY IF EXISTS deny_direct_insert_on_webhooks ON public.webhooks;
DROP POLICY IF EXISTS deny_direct_update_on_webhooks ON public.webhooks;
DROP POLICY IF EXISTS deny_direct_delete_on_webhooks ON public.webhooks;

CREATE POLICY deny_direct_select_on_webhooks
ON public.webhooks
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY deny_direct_insert_on_webhooks
ON public.webhooks
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY deny_direct_update_on_webhooks
ON public.webhooks
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY deny_direct_delete_on_webhooks
ON public.webhooks
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);

DROP POLICY IF EXISTS
"Allow org members to select webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Allow admin to insert webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Allow admin to update webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Deny direct select on webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Deny direct insert on webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Deny direct update on webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
"Deny direct delete on webhook_deliveries" -- noqa: RF05
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
deny_direct_select_on_webhook_deliveries
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
deny_direct_insert_on_webhook_deliveries
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
deny_direct_update_on_webhook_deliveries
ON public.webhook_deliveries;
DROP POLICY IF EXISTS
deny_direct_delete_on_webhook_deliveries
ON public.webhook_deliveries;

CREATE POLICY deny_direct_select_on_webhook_deliveries
ON public.webhook_deliveries
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY deny_direct_insert_on_webhook_deliveries
ON public.webhook_deliveries
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY deny_direct_update_on_webhook_deliveries
ON public.webhook_deliveries
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY deny_direct_delete_on_webhook_deliveries
ON public.webhook_deliveries
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
