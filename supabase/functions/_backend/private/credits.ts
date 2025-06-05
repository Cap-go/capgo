import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { bytesToGb } from '../utils/conversion.ts'
import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const { data: credits } = await supabaseAdmin(c as any)
      .from('capgo_credits_steps')
      .select()
      .order('price_per_unit')
    // use bytesToGb function to convert all column storage and bandwidth to GB
    const creditsFinal = credits?.map((credit) => {
      // convert type bandwidth to gb and storage to gb
      if (credit.type === 'bandwidth') {
        credit.step_min = bytesToGb(credit.step_min)
        credit.step_max = bytesToGb(credit.step_max)
      }
      else if (credit.type === 'storage') {
        credit.step_min = bytesToGb(credit.step_min)
        credit.step_max = bytesToGb(credit.step_max)
      }
      return credit
    })
    return c.json(creditsFinal || [])
  }
  catch (e) {
    return c.json({ status: 'Cannot get credits', error: JSON.stringify(e) }, 500)
  }
})
