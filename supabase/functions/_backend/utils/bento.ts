import { Analytics } from '@bentonow/bento-node-sdk'
import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'

function hasBento(c: Context) {
  return getEnv(c, 'BENTO_PUBLISHABLE_KEY').length > 0 && getEnv(c, 'BENTO_SECRET_KEY').length > 0 && getEnv(c, 'BENTO_SITE_UUID').length > 0
}
export function initBento(c: Context) {
  if (!hasBento(c)) {
    return {
      V1: {
        track: (data: any) => {
          console.log('track', data)
          return true
        },
        tagSubscriber: (data: any) => {
          console.log('tagSubscriber', data)
          return true
        },
        Commands: {
          addTag: (data: any) => {
            console.log('addTag', data)
            return true
          },
          removeTag: (data: any) => {
            console.log('removeTag', data)
            return true
          },
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

export async function trackBentoEvent(c: Context, email: string, data: any, event: string) {
  if (!hasBento(c))
    return
  try {
    const bento = initBento(c)
    const res = await bento.V1.track({
      email,
      type: event,
      fields: data,
    })
    console.log('trackBentoEvent', email, event, res)
    return true
  }
  catch (e) {
    console.log('trackBentoEvent error', e)
    return false
  }
}

export async function addTagBento(c: Context, email: string, segments: { segments: string[], deleteSegments: string[] }) {
  // console.log('addDataContact', email, data, segments)
  // return trackEvent(c, email, shallowCleanObject({ ...data, ...segments }), 'user:addData')
  if (!hasBento(c))
    return
  try {
    const bento = initBento(c)
    const deleteSeg = segments.deleteSegments.map((segment) => {
      return bento.V1.Commands.removeTag({
        email,
        tagName: segment,
      })
    })
    const addSeg = segments.segments.map((segment) => {
      return bento.V1.Commands.addTag({
        email,
        tagName: segment,
      })
    })
    await Promise.all([...deleteSeg, ...addSeg])
    console.log('trackBentoEvent', email, segments)
    return true
  }
  catch (e) {
    console.log('trackBentoEvent error', e)
    return false
  }
}
