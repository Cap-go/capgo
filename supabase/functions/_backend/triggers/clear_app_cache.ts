// DO nothing it's only for cache

import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', middlewareAPISecret, (c) => {
  try {
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500)
  }
})
