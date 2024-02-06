
import { LogSnag } from 'logsnag'

import { Context } from 'hono';
import { getEnv } from './utils.ts'

interface LogSnagExt extends LogSnag {
  insights(data: { title: string, value: string | boolean | number, icon: string }[]): Promise<void>
}

const logsnag = (c: Context) => {
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
  ? new LogSnag({
    token: getEnv(c, 'LOGSNAG_TOKEN'),
    project: getEnv(c, 'LOGSNAG_PROJECT'),
  })
  : {
      publish: () => Promise.resolve(true),
      track: () => Promise.resolve(true),
      insight: {
        track: () => Promise.resolve(true),
        increment: () => Promise.resolve(true),
      },
      insights: () => Promise.resolve(true),
    };
  (ls as LogSnagExt).insights = async (data: { title: string, value: string | boolean | number, icon: string }[]) => {
    const all = []
    console.log('logsnag', data)
    for (const d of data)
      all.push(ls.insight.track(d))
    await Promise.all(all)
  }
  return ls as LogSnagExt
}

// const logsnag = { publish: lsg.publish, insight, ...lsg }
export { logsnag }
