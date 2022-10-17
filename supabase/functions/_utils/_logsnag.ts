import { LogSnag } from 'https://cdn.skypack.dev/logsnag@0.1.4-beta.1'

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

