import type { Context } from '@hono/hono'
import ky from 'ky'
import { cloudlog } from './loggin.ts'
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
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Capgo',
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
    // https://web.capgo.app/app/p/ee--forgr--capacitor_go/d/BDACE2AB-53F9-411F-AF7A-C22D104DA632
    // https://web.capgo.app/app/p/ee--forgr--capacitor_go/d/BDACE2AB-53F9-411F-AF7A-C22D104DA632
    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')

    const payload = {
      events: [{
        type: event,
        email,
        details: data,
      }],
    }
    const res = await bentoKy.post('batch/events', {
      searchParams: {
        site_uuid: siteUuid,
      },
      json: payload,
    }).json<{ results: number, failed: number }>()
    if (res.failed > 0) {
      console.error({ requestId: c.get('requestId'), message: 'trackBentoEvent', error: res })
      return false
    }
    return true
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'trackBentoEvent error', error: e })
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
        command: 'remove_tag',
        email,
        query: segment,
      })),
      ...segments.segments.map(segment => ({
        command: 'add_tag',
        email,
        query: segment,
      })),
    ]

    const results = await Promise.all(commands.map(command =>
      bentoKy.post('fetch/commands', {
        searchParams: {
          site_uuid: siteUuid,
        },
        json: {
          command,
        },
      }).json(),
    ))

    cloudlog({ requestId: c.get('requestId'), message: 'addTagBento', email, commands, results })
    return true
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'addTagBento error', error: e })
    return false
  }
}
