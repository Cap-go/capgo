import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { deleteBundle } from './delete.ts'
import { type GetLatest, getApp } from './get.ts'

export const app = new OpenAPIHono()

app.route('/', getApp)

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
