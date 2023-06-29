import { LogSnag } from 'https://cdn.logsnag.com/deno/1.0.0-beta.6/index.ts'
import { getEnv } from './utils.ts'

const logsnag = getEnv('LOGSNAG_TOKEN')
  ? new LogSnag({
    token: getEnv('LOGSNAG_TOKEN'),
    project: getEnv('LOGSNAG_PROJECT'),
  })
  : {
      publish: () => Promise.resolve(true),
      track: () => Promise.resolve(true),
      insight: {
        track: () => Promise.resolve(true),
        increment: () => Promise.resolve(true),
      },
      insights: () => Promise.resolve(true),
    }

async function insights(data: { title: string; value: string | boolean | number; icon: string }[]) {
  const all = []
  console.log('logsnag', data)
  for (const d of data)
    all.push(logsnag.insight.track(d))
  await Promise.all(all)
}

// const logsnag = { publish: lsg.publish, insight, ...lsg }
export { logsnag, insights }
