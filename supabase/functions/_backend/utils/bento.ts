import { Analytics } from '@bentonow/bento-node-sdk'
import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'

export function initBento(c: Context) {
  if (!getEnv(c, 'BENTO_PUBLISHABLE_KEY') || !getEnv(c, 'BENTO_SECRET_KEY') || !getEnv(c, 'BENTO_SITE_UUID')) {
    return {
      V1: {
        track: (event: string, data: any) => {
          console.log('track', event, data)
          return true
        },
      },
    }
  }
  const bento = new Analytics({
    authentication: {
      publishableKey: getEnv(c, 'BENTO_PUBLISHABLE_KEY'),
      secretKey: getEnv(c, 'BENTO_SECRET_KEY'),
    },
    logErrors: false,
    siteUuid: getEnv(c, 'BENTO_SITE_UUID'),
  })
  return bento
}
