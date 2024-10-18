import type { Context } from '@hono/hono'
import type { ChannelSet } from './delete.ts'
import { Hono } from 'hono/tiny'
import { getBody, middlewareKey } from '../../utils/hono.ts'
import { deleteChannel } from './delete.ts'
import { get } from './get.ts'
import { post } from './post.ts'

export const app = new Hono()

app.post('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey')
    return post(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<ChannelSet>(c)
    const apikey = c.get('apikey')
    return get(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<ChannelSet>(c)
    const apikey = c.get('apikey')
    return deleteChannel(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
  }
})
