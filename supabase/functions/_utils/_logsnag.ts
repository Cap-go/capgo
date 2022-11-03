import { LogSnag } from 'https://cdn.logsnag.com/deno/0.1.5/index.ts'

const logsnag = Deno.env.get('LOGSNAG_TOKEN')
  ? new LogSnag({
    token: Deno.env.get('LOGSNAG_TOKEN') || '',
    project: Deno.env.get('LOGSNAG_PROJECT') || '',
  })
  : { publish: () => Promise.resolve(true), insight: () => Promise.resolve(true), insights: () => Promise.resolve(true) }

const insights = async (data: { title: string; value: number; icon: string }[]) => {
  const all = []
  for (const d of data)
    all.push(logsnag.insight(d))

  await Promise.all(all)
}

// const logsnag = { publish: lsg.publish, insight, ...lsg }
export { logsnag, insights }

