// DO nothing it's only for cache

import { BRES, honoFactory, middlewareAPISecret } from '../utils/hono.ts'

export const app = honoFactory.createApp()

app.get('/', middlewareAPISecret, (c) => {
  try {
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500)
  }
})
