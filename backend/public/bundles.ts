import { Hono } from 'https://deno.land/x/hono/mod.ts'

export const app = new Hono()

app.get('/', (c: Context) => {

  console.log('hello world', c)
})
