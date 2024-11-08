import type { Context } from '@hono/hono'
import type { DeviceLink } from './delete.ts'
import { Hono } from 'hono/tiny'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { deleteOverride } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = new Hono()

app.post('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return post(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot post devices', e)
    return c.json({ status: 'Cannot post devices', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write', 'read']), async (c: Context) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return get(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot get devices', e)
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return deleteOverride(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot delete devices', e)
    return c.json({ status: 'Cannot delete devices', error: JSON.stringify(e) }, 500)
  }
})
