import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

interface NavigationEventPayload {
  type: 'app:created' | 'bundle:uploaded' | 'logs:error'
  data: {
    appId: string
    bundleId?: string
    bundleName?: string
  }
}

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<NavigationEventPayload>(c)
  const auth = c.get('auth')!
  const requestId = c.get('requestId')

  cloudlog({ requestId, message: 'navigation_event_received', type: body.type, appId: body.data.appId })

  // Validate payload
  if (!body.type || !['app:created', 'bundle:uploaded', 'logs:error'].includes(body.type)) {
    return simpleError('invalid_event_type', 'Invalid event type. Must be one of: app:created, bundle:uploaded, logs:error')
  }

  if (!body.data?.appId) {
    return simpleError('missing_app_id', 'Missing appId in event data')
  }

  if (body.type === 'bundle:uploaded' && !body.data.bundleId) {
    return simpleError('missing_bundle_id', 'Missing bundleId for bundle:uploaded event')
  }

  // Get the user's org ID for the channel name
  const supabase = supabaseAdmin(c)
  
  // Get the app to verify ownership and get org_id
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', body.data.appId)
    .single()

  if (appError || !app) {
    cloudlog({ requestId, message: 'app_not_found_for_navigation_event', appId: body.data.appId, error: appError })
    return c.json({ error: 'app_not_found', message: 'App not found' }, 404)
  }

  // Verify the authenticated user has access to this app's org
  // For JWT auth, userId is the org_id
  // For API key auth, we need to check the apikey's owner_org
  let userOrgId: string | null = null
  
  if (auth.authType === 'jwt' && auth.userId) {
    userOrgId = auth.userId
  }
  else if (auth.authType === 'apikey' && auth.apikey) {
    userOrgId = auth.apikey.owner_org
  }

  if (!userOrgId || userOrgId !== app.owner_org) {
    cloudlog({ requestId, message: 'unauthorized_navigation_event', userOrgId, appOwnerOrg: app.owner_org })
    return c.json({ error: 'unauthorized', message: 'Not authorized to send events for this app' }, 403)
  }

  // Broadcast the event to the org's navigation channel
  const channelName = `navigation:${app.owner_org}`
  
  try {
    // Create a channel and subscribe before broadcasting
    const channel = supabase.channel(channelName)
    
    // Subscribe to the channel (required before sending)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel subscription timeout'))
      }, 5000) // 5 second timeout

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout)
          resolve()
        }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout)
          reject(new Error(`Channel subscription failed: ${status}`))
        }
      })
    })

    // Broadcast the message
    const sendResult = await channel.send({
      type: 'broadcast',
      event: 'navigation',
      payload: {
        type: body.type,
        data: body.data,
      },
    })

    // Unsubscribe from the channel after sending (cleanup)
    await supabase.removeChannel(channel)

    if (sendResult !== 'ok') {
      cloudlog({ requestId, message: 'broadcast_send_failed', result: sendResult })
      return simpleError('broadcast_failed', 'Failed to broadcast navigation event')
    }

    cloudlog({ requestId, message: 'navigation_event_broadcasted', channel: channelName, type: body.type })
  }
  catch (error) {
    cloudlog({ requestId, message: 'broadcast_exception', error })
    return simpleError('broadcast_exception', 'Exception during broadcast', { error })
  }

  return c.json(BRES)
})
