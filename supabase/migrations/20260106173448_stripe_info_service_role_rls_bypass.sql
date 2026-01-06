-- Allow service_role to bypass RLS on stripe_info for Stripe webhook updates
CREATE POLICY "Allow service_role full access to stripe_info"
ON public.stripe_info
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
