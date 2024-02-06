// DO nothing it's only for redis cache 

import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';

export const app = new Hono()

app.get('/', middlewareAPISecret, (c: Context) => {
  try {
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500) 
  }
})
