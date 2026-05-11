-- Keep direct PostgREST access to public.apikeys aligned with the API key
-- management Edge endpoints: JWT callers and unrestricted all-mode API keys
-- may manage account-level API keys, but org/app-limited keys may not enumerate
-- or delete sibling credentials through table RLS.

DROP POLICY IF EXISTS "Allow owner to select own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to select own apikeys" ON "public"."apikeys"
FOR SELECT
TO "anon", "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);

DROP POLICY IF EXISTS "Allow owner to delete own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to delete own apikeys" ON "public"."apikeys"
FOR DELETE
TO "anon", "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);
