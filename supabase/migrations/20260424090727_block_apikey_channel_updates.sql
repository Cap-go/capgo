-- Block direct PostgREST channel updates for API-key sessions.
-- Key-authenticated channel mutations should go through the /channel edge function,
-- which performs explicit permission checks and writes with service_role.

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (write+)" ON public.channels;

CREATE POLICY "Allow update for auth, api keys (write, all) (write+)" ON public.channels
FOR UPDATE
TO authenticated
USING (
  public.check_min_rights(
    'write'::public.user_min_right,
    public.get_identity_org_appid('{write,all}'::public.key_mode[], owner_org, app_id),
    owner_org,
    app_id,
    NULL::bigint
  )
)
WITH CHECK (
  public.check_min_rights(
    'write'::public.user_min_right,
    public.get_identity_org_appid('{write,all}'::public.key_mode[], owner_org, app_id),
    owner_org,
    app_id,
    NULL::bigint
  )
);
