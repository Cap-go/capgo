DROP POLICY IF EXISTS "Allow owner to insert own apikeys" ON public.apikeys;
DROP POLICY IF EXISTS "Deny client insert on apikeys" ON public.apikeys;
CREATE POLICY "Deny client insert on apikeys"
ON public.apikeys
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow owner to update own apikeys" ON public.apikeys;
DROP POLICY IF EXISTS "Allow owner to update own V2 apikeys" ON public.apikeys;
DROP POLICY IF EXISTS "Deny client update on apikeys" ON public.apikeys;
CREATE POLICY "Deny client update on apikeys"
ON public.apikeys
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow insert org for user" ON public.orgs;

CREATE POLICY "Allow insert org for user"
ON public.orgs
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
);

DROP FUNCTION IF EXISTS public.get_identity_for_apikey_creation();
