-- Keep direct PostgREST access to public.apikeys aligned with authenticated
-- session management: JWT callers may manage account-level API keys, but API
-- key callers must use the API key management RPC/Edge endpoint path instead
-- of enumerating or deleting sibling credentials through table RLS.

DROP POLICY IF EXISTS "Allow owner to select own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to select own apikeys" ON "public"."apikeys"
FOR SELECT
TO "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);

DROP POLICY IF EXISTS "Allow owner to delete own apikeys" ON "public"."apikeys";
CREATE POLICY "Allow owner to delete own apikeys" ON "public"."apikeys"
FOR DELETE
TO "authenticated"
USING (
  "user_id" = (SELECT public.get_identity_for_apikey_creation())
);
