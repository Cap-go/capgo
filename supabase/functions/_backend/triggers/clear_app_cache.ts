// DO nothing it's only for cache

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', middlewareAPISecret, (c) => {
  return c.json(BRES)
})
