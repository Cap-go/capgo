import type { Context } from 'hono'
import { LogSnag } from '@logsnag/node'

import { cloudlog, cloudlogErr, serializeError } from './loggin.ts'
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

async function logsnagInsights(c: Context, data: { title: string, value: string | boolean | number, icon: string }[]) {
  cloudlog({ requestId: c.get('requestId'), message: 'logsnagInsights', data })
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
  const project = getEnv(c, 'LOGSNAG_PROJECT')
  if (!ls || !project)
    return Promise.resolve(false)

  // Send all insights in parallel
  const promises = data.map(async (d) => {
    const payload = {
      title: d.title,
      value: d.value,
      icon: d.icon,
      project,
    }

    try {
      const response = await fetch('https://api.logsnag.com/v1/insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ls}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.text()
        cloudlogErr({ requestId: c.get('requestId'), message: 'logsnagInsights error', status: response.status, error, payload })
        return false
      }

      return await response.json()
    }
    catch (e) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'logsnagInsights error', error: serializeError(e), payload })
      return false
    }
  })

  return Promise.all(promises)
}

export { logsnag, logsnagInsights }
