import { LogSnag } from '@logsnag/node'

import type { Context } from 'hono'
import { getEnv } from './utils.ts'

interface LogSnagExt {
  insights: (data: { title: string, value: string | boolean | number, icon: string }[]) => Promise<void>
}

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
        insights: () => Promise.resolve(true),
      };
  (ls as LogSnagExt & LogSnag).insights = async (data: { title: string, value: string | boolean | number, icon: string }[]) => {
    const all = []
    console.log('logsnag', data)
    for (const d of data)
      all.push(ls.insight.track(d))
    await Promise.all(all)
  }
  return ls as LogSnagExt & LogSnag
}

// const logsnag = { publish: lsg.publish, insight, ...lsg }
export { logsnag }
