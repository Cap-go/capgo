import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAPISecret, useCors } from '../utils/hono.ts'
import { checkPlanOrg } from '../utils/plans.ts'

interface orgToGet {
  orgId?: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<orgToGet>()
    console.log('body', body)
    if (!body.orgId)
      return c.json({ status: 'No appId' }, 400)

    await checkPlanOrg(c, body.orgId)
    console.log('status saved')
    return c.json({ status: 'status saved' })
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
