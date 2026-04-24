-- Block direct PostgREST channel updates for write-scoped API keys.
-- Authenticated users keep their existing write access, and all-scoped API keys
-- still retain the direct channel update behavior expected by the CLI.

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (write+)" ON public.channels;

CREATE POLICY "Allow update for auth, api keys (write, all) (write+)" ON public.channels
FOR UPDATE
TO anon, authenticated
USING (
  public.check_min_rights(
    'write'::public.user_min_right,
    public.get_identity_org_appid('{all}'::public.key_mode[], owner_org, app_id),
    owner_org,
    app_id,
    NULL::bigint
  )
)
WITH CHECK (
  public.check_min_rights(
    'write'::public.user_min_right,
    public.get_identity_org_appid('{all}'::public.key_mode[], owner_org, app_id),
    owner_org,
    app_id,
    NULL::bigint
  )
);
