import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { getTopAppsCF, getTotalAppsByModeCF } from '../utils/cloudflare.ts'
import { useCors } from '../utils/hono.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', async (c: Context) => {
  try {
    // count allapps
    const mode = c.req.query('mode') || 'capacitor'

    const countTotal = await getTotalAppsByModeCF(c, mode)
    const data = await getTopAppsCF(c, mode, 100)

    const totalCategory = countTotal || 0

    if (data) {
      return c.json({
        apps: data || [],
        // calculate percentage usage
        usage: ((totalCategory * 100) / countTotal).toFixed(2),
      })
    }
    return c.json({
      status: 'Error unknow',
    }, 500)
  }
  catch (e) {
    return c.json({ status: 'Cannot get top store apps', error: JSON.stringify(e) }, 500)
  }
})
