import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { BRES, middlewareKey } from '../_utils/hono.ts'

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<any>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot post bundle', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', async (c: Context) => {
  try {
    const body = await c.req.json<any>()
    // const apikey = c.get('apikey')
    console.log('body', body)
    // console.log('apikey', apikey)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500) 
  }
})

app.delete('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<any>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
