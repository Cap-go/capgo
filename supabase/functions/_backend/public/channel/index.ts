import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { post } from './post.ts'
import type { ChannelSet } from './delete.ts'
import { deleteChannel } from './delete.ts'
import { getRouteAndSchema } from './docs.ts'
import { getApp } from './get.ts'

export function appGenerator(deprecated: boolean) {
  const app = new OpenAPIHono()

  app.route('/', getApp(deprecated))

  return app
}

// app.post('/', middlewareKey(['all', 'write']), async (c: Context) => {
//   try {
//     const body = await c.req.json<ChannelSet>()
//     const apikey = c.get('apikey')
//     return post(c, body, apikey)
//   }
//   catch (e) {
//     return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
//   }
// })

// app.get('/', middlewareKey(['all', 'write']), async (c: Context) => {
//   try {
//     const body = await getBody<ChannelSet>(c)
//     const apikey = c.get('apikey')
//     return get(c, body, apikey)
//   }
//   catch (e) {
//     return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
//   }
// })

// app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
//   try {
//     const body = await getBody<ChannelSet>(c)
//     const apikey = c.get('apikey')
//     return deleteChannel(c, body, apikey)
//   }
//   catch (e) {
//     return c.json({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
//   }
// })
