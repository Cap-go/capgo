import type { Context } from '@hono/hono'
import { LogSnag } from '@logsnag/node'

import ky from 'ky'
import { getEnv } from './utils.ts'

function logsnag(c: Context) {
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
    ? new LogSnag({
      token: getEnv(c, 'LOGSNAG_TOKEN'),
      project: getEnv(c, 'LOGSNAG_PROJECT'),
    })
    : {
        publish: () => Promise.resolve(true),
        track: (_obj: any) => Promise.resolve(true),
        insight: {
          track: (_obj: any) => Promise.resolve(true),
          increment: () => Promise.resolve(true),
        },
      }
  return ls as LogSnag
}

function logsnagInsights(c: Context, data: { title: string, value: string | boolean | number, icon: string }[]) {
  console.log({ requestId: c.get('requestId'), message: 'logsnagInsights', data })
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
  const project = getEnv(c, 'LOGSNAG_PROJECT')
  if (!ls || !project)
    return Promise.resolve(false)
  // loop on all insights and send a request for each then return the promise all
  const all = []
  for (const d of data) {
    const payload = {
      title: d.title,
      value: d.value,
      icon: d.icon,
      project,
    }
    all.push(ky.post('https://api.logsnag.com/v1/insight', {
      json: payload,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ls}`,
      },
    }).then(res => res.json())
      .catch((e) => {
        console.error({ requestId: c.get('requestId'), context: 'logsnagInsights', error: e, payload })
        return false
      }),
    )
  }
  return Promise.all(all)
}

export { logsnag, logsnagInsights }
