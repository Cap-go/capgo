import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import { cloudlogErr, serializeError } from './logging.ts'
import { logsnag } from './logsnag.ts'
import { sendNotifToOrgMembers } from './org_email_notifications.ts'
import { getDrizzleClient, getPgClient } from './pg.ts'
import { trackPosthogEvent } from './posthog.ts'
import { backgroundTask } from './utils.ts'

export interface BentoTrackingPayload {
  cron: string
  data: Record<string, unknown>
  event: string
  preferenceKey: import('./org_email_notifications.ts').EmailPreferenceKey
  uniqId: string
}

export interface SendEventToTrackingPayload extends TrackOptions {
  bento?: BentoTrackingPayload
  sentToBento?: boolean
}

export interface SendEventToTrackingOptions {
  background?: boolean
  ip?: string
}

async function runTrackedCall(c: Context, provider: string, task: () => Promise<unknown>) {
  try {
    await task()
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'sendEventToTracking provider failed',
      provider,
      error: serializeError(error),
    })
  }
}

function getTrackingIp(c: Context, ip?: string) {
  if (ip)
    return ip

  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
}

async function executeTracking(c: Context, payload: TrackOptions, options: SendEventToTrackingOptions) {
  const tasks: Array<Promise<void>> = [
    runTrackedCall(c, 'logsnag', () => logsnag(c).track(payload)),
    runTrackedCall(c, 'posthog', () => trackPosthogEvent(c, {
      event: payload.event,
      user_id: payload.user_id,
      tags: payload.tags,
      channel: payload.channel,
      description: payload.description,
      ip: getTrackingIp(c, options.ip),
    })),
  ]

  await Promise.all(tasks)
}

async function executeBentoTracking(c: Context, payload: SendEventToTrackingPayload) {
  if (!payload.sentToBento)
    return

  const bento = payload.bento
  if (!bento) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'sendEventToTracking missing Bento payload',
      event: payload.event,
      user_id: payload.user_id,
    })
    return
  }

  const orgId = payload.user_id
  if (!orgId || typeof orgId !== 'string') {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'sendEventToTracking missing org id for Bento notification',
      event: payload.event,
      user_id: payload.user_id,
    })
    return
  }

  await runTrackedCall(c, 'bento', async () => {
    const pgClient = getPgClient(c, true)
    try {
      await sendNotifToOrgMembers(
        c,
        bento.event,
        bento.preferenceKey,
        bento.data,
        orgId,
        bento.uniqId,
        bento.cron,
        getDrizzleClient(pgClient),
      )
    }
    finally {
      await pgClient.end()
    }
  })
}

export async function sendEventToTracking(c: Context, payload: SendEventToTrackingPayload, options: SendEventToTrackingOptions = {}) {
  const trackingTask = executeTracking(c, payload, options)
  if (options.background === false) {
    await trackingTask
    await executeBentoTracking(c, payload)
    return
  }

  await backgroundTask(c, trackingTask)
  await backgroundTask(c, executeBentoTracking(c, payload))
}
