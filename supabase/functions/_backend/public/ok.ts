import { BRES, honoFactory } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'

export const app = honoFactory.createApp()

app.post('/', async (c) => {
  const body = await c.req.json<any>()
  cloudlog({ requestId: c.get('requestId'), message: 'body', data: body })
  return c.json(BRES)
})

app.get('/', (c) => {
  return c.json(BRES)
})
