import { LogSnag } from 'https://cdn.logsnag.com/deno/0.1.5/index.ts'
import { getEnv } from './utils.ts'

const logsnag = getEnv('LOGSNAG_TOKEN')
  ? new LogSnag({
    token: getEnv('LOGSNAG_TOKEN'),
    project: getEnv('LOGSNAG_PROJECT'),
  })
  : { publish: () => Promise.resolve(true), insight: () => Promise.resolve(true), insights: () => Promise.resolve(true) }

async function insights(data: { title: string; value: string | boolean | number; icon: string }[]) {
  const all = []
  console.log('logsnag', data)
  for (const d of data)
    all.push(logsnag.insight(d))
  await Promise.all(all)
}

// const logsnag = { publish: lsg.publish, insight, ...lsg }
export { logsnag, insights }
