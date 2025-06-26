import { BRES, honoFactory } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'

export const app = honoFactory.createApp()

app.post('/', async (c) => {
  try {
    const body = await c.req.json<any>()
    cloudlog({ requestId: c.get('requestId'), message: 'body', data: body })
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', (c) => {
  try {
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get ok', error: JSON.stringify(e) }, 500)
  }
})
