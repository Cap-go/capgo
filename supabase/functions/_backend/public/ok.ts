import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { BRES } from '../utils/hono.ts'

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<any>()
    console.log('body', body)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', (c: Context) => {
  try {
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get ok', error: JSON.stringify(e) }, 500)
  }
})
