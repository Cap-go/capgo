// DO nothing it's only for redis cache 
import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { BRES } from '../../_utils/hono.ts';

export const app = new Hono()

app.get('/', (c: Context) => {
  try {
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot invalidate cache', error: JSON.stringify(e) }, 500) 
  }
})
