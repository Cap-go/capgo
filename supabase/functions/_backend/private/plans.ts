import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { bytesToGb } from '../utils/conversion.ts'
import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  const { data: plans } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .order('price_m')
    // use bytesToGb function to convert all column storage and bandwidth to GB
  const plansGb = plans?.map((plan) => {
    plan.storage = bytesToGb(plan.storage)
    plan.bandwidth = bytesToGb(plan.bandwidth)
    return plan
  })
  return c.json(plansGb ?? [])
})
