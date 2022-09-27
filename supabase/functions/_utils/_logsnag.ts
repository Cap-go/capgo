import { LogSnag } from 'https://deno.land/x/logsnag@0.1.3/src/mod.ts'

const logsnag = new LogSnag({
  token: Deno.env.get('LOGSNAG_TOKEN') || '',
  project: Deno.env.get('LOGSNAG_PROJECT') || '',
})

export { logsnag }
