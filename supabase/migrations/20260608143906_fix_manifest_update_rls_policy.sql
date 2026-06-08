DROP POLICY IF EXISTS
"Prevent users from updating manifest entries" -- noqa: RF05
ON public.manifest;

CREATE POLICY
"Prevent users from updating manifest entries" -- noqa: RF05
ON public.manifest
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);
