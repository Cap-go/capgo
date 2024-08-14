import ky from 'ky'
import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'

function hasBento(c: Context) {
  return getEnv(c, 'BENTO_PUBLISHABLE_KEY').length > 0 && getEnv(c, 'BENTO_SECRET_KEY').length > 0 && getEnv(c, 'BENTO_SITE_UUID').length > 0
}

function initBentoKy(c: Context) {
  if (!hasBento(c)) {
    return null
  }

  const publishableKey = getEnv(c, 'BENTO_PUBLISHABLE_KEY')
  const secretKey = getEnv(c, 'BENTO_SECRET_KEY')

  const authKey = btoa(`${publishableKey}:${secretKey}`)

  return ky.extend({
    prefixUrl: 'https://app.bentonow.com/api/v1',
    headers: {
      'Authorization': `Basic ${authKey}`,
      'Content-Type': 'application/json',
    },
  })
}

export async function trackBentoEvent(c: Context, email: string, data: any, event: string) {
  if (!hasBento(c))
    return

  try {
    const bentoKy = initBentoKy(c)
    if (!bentoKy)
      return

    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')

    const res = await bentoKy.post('batch/events', {
      json: {
        site_uuid: siteUuid,
        events: [{
          type: event,
          email,
          fields: data,
        }],
      },
    }).json()

    console.log('trackBentoEvent', email, event, res)
    return true
  }
  catch (e) {
    console.log('trackBentoEvent error', e)
    return false
  }
}

export async function addTagBento(c: Context, email: string, segments: { segments: string[], deleteSegments: string[] }) {
  if (!hasBento(c))
    return

  try {
    const bentoKy = initBentoKy(c)
    if (!bentoKy)
      return

    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')

    const commands = [
      ...segments.deleteSegments.map(segment => ({
        command: '$remove_tag',
        email,
        query: segment,
      })),
      ...segments.segments.map(segment => ({
        command: '$tag',
        email,
        query: segment,
      })),
    ]

    const results = await Promise.all(commands.map(command =>
      bentoKy.post('subscriber', {
        json: {
          site_uuid: siteUuid,
          command,
        },
      }).json(),
    ))

    console.log('addTagBento', email, segments, results)
    return true
  }
  catch (e) {
    console.log('addTagBento error', e)
    return false
  }
}
