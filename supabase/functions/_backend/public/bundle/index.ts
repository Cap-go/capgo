import type { Context } from '@hono/hono'
import type { GetLatest } from './get.ts'
import { Hono } from 'hono/tiny'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { deleteBundle } from './delete.ts'
import { get } from './get.ts'

export const app = new Hono()

app.get('/', middlewareKey(['all', 'write', 'read']), async (c: Context) => {
  try {
    const body = await getBody<GetLatest>(c)
    const apikey = c.get('apikey')
    return get(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<GetLatest>(c)
    const apikey = c.get('apikey')
    return deleteBundle(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
