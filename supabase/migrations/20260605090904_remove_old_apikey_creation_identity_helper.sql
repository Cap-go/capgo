DROP POLICY IF EXISTS "Allow insert org for user" ON public.orgs;

CREATE POLICY "Allow insert org for user"
ON public.orgs
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
);

DROP FUNCTION IF EXISTS public.get_identity_for_apikey_creation();
