import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { hasOrgRight, supabaseAdmin, updateOrCreateChannel } from '../../utils/supabase.ts'

export interface CreateDemoApp {
  owner_org: string
}

export async function createDemoApp(c: Context<MiddlewareKeyVariables>, body: CreateDemoApp): Promise<Response> {
  const requestId = c.get('requestId')
  const auth = c.get('auth') as AuthInfo | undefined

  if (!auth?.userId) {
    throw simpleError('not_authenticated', 'Not authenticated')
  }

  if (!body.owner_org) {
    throw simpleError('missing_owner_org', 'Missing owner_org', { body })
  }

  // Check if the user is allowed to create an app in this organization
  // Use hasOrgRight which works with supabaseAdmin (bypasses RLS after auth verification)
  if (!(await hasOrgRight(c, body.owner_org, auth.userId, 'write'))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { org_id: body.owner_org })
  }

  // Generate a unique demo app_id with com.demo. prefix
  // This prefix is used to identify demo apps for email skipping and auto-deletion
  const shortId = crypto.randomUUID().slice(0, 8)
  const appId = `com.demo.${shortId}.app`

  cloudlog({ requestId, message: 'Creating demo app', appId, owner_org: body.owner_org })

  // Create the demo app - identified by the com.demo. prefix in app_id
  // Auto-deletion after 14 days uses created_at timestamp
  const supabase = supabaseAdmin(c)
  const appInsert: Database['public']['Tables']['apps']['Insert'] = {
    owner_org: body.owner_org,
    app_id: appId,
    icon_url: '',
    name: 'Demo App',
    retention: 2592000,
    default_upload_channel: 'production',
  }

  const { data: appData, error: appError } = await supabase
    .from('apps')
    .insert(appInsert)
    .select()
    .single()

  if (appError) {
    cloudlog({ requestId, message: 'Error creating demo app', error: appError })
    throw simpleError('cannot_create_demo_app', 'Cannot create demo app', { supabaseError: appError })
  }

  cloudlog({ requestId, message: 'Demo app created', appData })

  // Create the default versions (unknown and builtin)
  // The on_app_create trigger also creates these, but we do it here to ensure
  // we have the version IDs immediately for channel creation
  const { data: versionsData, error: versionsError } = await supabase
    .from('app_versions')
    .upsert([
      {
        owner_org: body.owner_org,
        deleted: true,
        name: 'unknown',
        app_id: appId,
      },
      {
        owner_org: body.owner_org,
        deleted: true,
        name: 'builtin',
        app_id: appId,
      },
    ], { onConflict: 'name,app_id', ignoreDuplicates: true })
    .select()

  if (versionsError) {
    cloudlog({ requestId, message: 'Error creating default versions', error: versionsError })
    // Don't fail - the trigger might have already created them
  }
  else {
    cloudlog({ requestId, message: 'Default versions created', versionsData })
  }

  // Get the 'unknown' version ID to use for the channel
  const { data: unknownVersion, error: unknownVersionError } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .eq('name', 'unknown')
    .eq('owner_org', body.owner_org)
    .single()

  if (unknownVersionError || !unknownVersion) {
    cloudlog({ requestId, message: 'Error getting unknown version', error: unknownVersionError })
    throw simpleError('cannot_get_unknown_version', 'Cannot get unknown version', { error: unknownVersionError })
  }

  cloudlog({ requestId, message: 'Unknown version found', unknownVersion })

  // Create the production channel pointing to 'unknown' version
  const channelInsert: Database['public']['Tables']['channels']['Insert'] = {
    created_by: auth.userId,
    app_id: appId,
    name: 'production',
    public: true,
    disable_auto_update_under_native: true,
    disable_auto_update: 'major',
    ios: true,
    android: true,
    electron: true,
    allow_device_self_set: false,
    allow_emulator: true,
    allow_device: true,
    allow_dev: true,
    allow_prod: true,
    version: unknownVersion.id,
    owner_org: body.owner_org,
  }

  try {
    await updateOrCreateChannel(c, channelInsert)
  }
  catch (error) {
    cloudlog({ requestId, message: 'Error creating production channel for demo app', error })
    throw simpleError('cannot_create_production_channel', 'Cannot create production channel for demo app', { error })
  }

  cloudlog({ requestId, message: 'Production channel created for demo app' })

  return c.json({
    status: 'ok',
    app_id: appId,
    name: 'Demo App',
    message: 'Demo app created successfully. You can now explore the Capgo dashboard!',
  })
}
