import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES, getBody, middlewareAPISecret, middlewareKey } from '../utils/hono.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<any>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', async (c: Context) => {
  try {
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get ok', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<any>(c)
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete ok', error: JSON.stringify(e) }, 500)
  }
})
