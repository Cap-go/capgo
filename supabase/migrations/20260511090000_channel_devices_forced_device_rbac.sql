-- Ensure direct PostgREST access to forced-device overrides uses the
-- channel-scoped RBAC permissions instead of broad app read/write rights.

DROP POLICY IF EXISTS "Allow delete for auth, api keys (write+)"
ON public.channel_devices;

DROP POLICY IF EXISTS "Allow insert for auth (write+)"
ON public.channel_devices;

DROP POLICY IF EXISTS "Allow read for auth, api keys (read+)"
ON public.channel_devices;

DROP POLICY IF EXISTS "Allow read for auth (read+)"
ON public.channel_devices;

DROP POLICY IF EXISTS "Allow update for auth, api keys (write+)"
ON public.channel_devices;

CREATE POLICY "Allow delete for auth, api keys (write+)"
ON public.channel_devices
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

CREATE POLICY "Allow insert for auth (write+)"
ON public.channel_devices
FOR INSERT
TO authenticated
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

CREATE POLICY "Allow read for auth (read+)"
ON public.channel_devices
FOR SELECT
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_read_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

CREATE POLICY "Allow update for auth, api keys (write+)"
ON public.channel_devices
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_manage_forced_devices(),
    owner_org,
    app_id,
    channel_id
  )
);

COMMENT ON POLICY "Allow delete for auth, api keys (write+)"
ON public.channel_devices IS
'Direct channel_devices deletes require channel.manage_forced_devices for the target channel.';

COMMENT ON POLICY "Allow insert for auth (write+)"
ON public.channel_devices IS
'Direct channel_devices inserts require channel.manage_forced_devices for the target channel.';

COMMENT ON POLICY "Allow read for auth (read+)"
ON public.channel_devices IS
'Direct channel_devices reads require channel.read_forced_devices for the target channel.';

COMMENT ON POLICY "Allow update for auth, api keys (write+)"
ON public.channel_devices IS
'Direct channel_devices updates require channel.manage_forced_devices for both old and new target channels.';
