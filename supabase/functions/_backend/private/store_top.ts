import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { getTopAppsCF, getTotalAppsByModeCF } from '../utils/cloudflare.ts'
import { simpleError, useCors } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  // count allapps
  const mode = c.req.query('mode') ?? 'capacitor'

  const countTotal = await getTotalAppsByModeCF(c, mode)
  const data = await getTopAppsCF(c, mode, 100)

  const totalCategory = countTotal ?? 0

  if (!data) {
    throw simpleError('error_unknown', 'Error unknown')
  }
  return c.json({
    apps: data ?? [],
    // calculate percentage usage
    usage: ((totalCategory * 100) / countTotal).toFixed(2),
  })
})
