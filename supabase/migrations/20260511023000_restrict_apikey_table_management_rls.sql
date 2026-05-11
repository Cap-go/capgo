-- Keep direct PostgREST access to public.apikeys aligned with authenticated
-- session management: JWT callers may manage account-level API keys, but API
-- key callers must use the API key management RPC/Edge endpoint path instead
-- of enumerating or deleting sibling credentials through table RLS.
-- The legacy hashed-key RPC validates the caller itself and returns the newly
-- created credential, so run it as definer to keep that RPC path working after
-- removing anon table SELECT visibility.

ALTER FUNCTION "public"."create_hashed_apikey"(
  "p_mode" "public"."key_mode",
  "p_name" "text",
  "p_limited_to_orgs" "uuid"[],
  "p_limited_to_apps" "text"[],
  "p_expires_at" timestamp with time zone
) SECURITY DEFINER;

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
