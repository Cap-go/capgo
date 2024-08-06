import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from '@hono/hono'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import type { DeviceLink } from './delete.ts'
import { deleteOverride } from './delete.ts'
import { post } from './post.ts'
import { getApp } from './get.ts'

export const app = new OpenAPIHono()

app.route('/', getApp)

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
