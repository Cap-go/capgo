import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { existInEnv, getEnv } from './utils.ts'

export interface ActivationPalUser {
  id?: string
  email?: string
  name?: string
  traits?: Record<string, any>
}

export interface ActivationPalEvent {
  name: string
  ip?: string
  trackSession?: boolean
  properties?: Record<string, any>
}

export interface ActivationPalPayload {
  user: ActivationPalUser
  event: ActivationPalEvent
}

const ACTIVATIONPAL_URL = 'https://activationpal.com/api/v1/events'

export async function trackActivationpalEvent(c: Context, payload: ActivationPalPayload) {
  const apiKey = getEnv(c, 'ACTIVATIONPAL_API_KEY')
  if (!apiKey || !existInEnv(c, 'ACTIVATIONPAL_API_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'ActivationPal not configured' })
    return false
  }

  try {
    const res = await fetch(ACTIVATIONPAL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const error = await res.text()
      cloudlogErr({ requestId: c.get('requestId'), message: 'ActivationPal error', status: res.status, error })
      return false
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'ActivationPal event sent',
      event: payload.event?.name,
      user: payload.user?.id ?? payload.user?.email,
    })
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'ActivationPal fetch failed', error: serializeError(e) })
    return false
  }
}
