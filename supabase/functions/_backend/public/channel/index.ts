import { OpenAPIHono } from '@hono/zod-openapi'
import { defaultOpenApiErrorHandler } from '../../utils/open_api.ts'
import { deleteApp } from './delete.ts'
import { getApp } from './get.ts'
import { postApp } from './post.ts'

export function appGenerator(deprecated: boolean) {
  const app = new OpenAPIHono()

  app.use('*', defaultOpenApiErrorHandler)

  app.route('/', getApp(deprecated))
  app.route('/', postApp(deprecated))
  app.route('/', deleteApp(deprecated))

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
