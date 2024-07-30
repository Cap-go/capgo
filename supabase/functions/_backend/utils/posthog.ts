import { PostHog } from 'posthog-node'
import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'

export function initPostHog(c: Context) {
  if (!getEnv(c, 'POSTHOG_API_KEY')) {
    return {
      capture: (data: any) => {
        console.log('capture', data)
        return true
      },
      shutdown: () => {
        console.log('shutdown')
        return true
      },
    }
  }
  const client = new PostHog(
    getEnv(c, 'POSTHOG_API_KEY'),
    { host: 'https://eu.i.posthog.com' },
  )
  return client
}

export function posthogCapture(c: Context, eventId: string, data: any) {
  const client = initPostHog(c)
  client.capture({
    distinctId: eventId,
    event: eventId.replaceAll(':', ' '),
    properties: data,
  })
  client.shutdown()
}
