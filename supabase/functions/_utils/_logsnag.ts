import { LogSnag } from 'https://cdn.logsnag.com/deno/0.1.5/index.ts'

const lsg = new LogSnag({
  token: Deno.env.get('LOGSNAG_TOKEN') || '',
  project: Deno.env.get('LOGSNAG_PROJECT') || '',
})

const insight = async (data: { title: string; value: number; icon: string }[]) => {
  const all = []
  for (const d of data)
    all.push(lsg.insight(d))

  await Promise.all(all)
}

const logsnag = { publish: lsg.publish, insight }
export { logsnag }

