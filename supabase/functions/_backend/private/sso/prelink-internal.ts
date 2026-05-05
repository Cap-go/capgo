import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { PrelinkUsersRequest } from './prelink-shared.ts'
import { createHono, middlewareAPISecret, parseBody, useCors } from '../../utils/hono.ts'
import { version } from '../../utils/version.ts'
import { runPrelinkUsers } from './prelink-shared.ts'

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAPISecret)

app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const rawBody = await parseBody<PrelinkUsersRequest>(c)
  return c.json(await runPrelinkUsers(c, rawBody))
})
