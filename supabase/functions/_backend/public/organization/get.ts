import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string().optional(),
})
const orgSchema = z.object({
  id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  logo: z.string().nullable(),
  name: z.string(),
  management_email: z.string().email(),
  customer_id: z.string().nullable(),
})

export async function get(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (body.orgId && !(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', apikey.key))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  if (body.orgId) {
    if (!apikeyHasOrgRight(apikey, body.orgId)) {
      console.error('You can\'t access this organization', body.orgId)
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
    }
    const { data, error } = await supabaseApikey(c, apikey.key)
      .from('orgs')
      .select('*')
      .eq('id', body.orgId)
      .single()
    if (error) {
      console.error('Cannot get organization', error)
      return c.json({ status: 'Cannot get organization', error: error.message }, 500)
    }
    const dataParsed = orgSchema.safeParse(data)
    if (!dataParsed.success) {
      console.error('Cannot parse organization', dataParsed.error)
      return c.json({ status: 'Cannot get organization', error: dataParsed.error.message }, 500)
    }
    return c.json(dataParsed.data)
  }
  else {
    const { data, error } = await supabaseApikey(c, apikey.key)
      .from('orgs')
      .select('*')
    if (error) {
      console.error('Cannot get organizations', error)
      return c.json({ status: 'Cannot get organizations', error: error.message }, 500)
    }
    const dataParsed = orgSchema.array().safeParse(data)
    if (!dataParsed.success) {
      console.error('Cannot parse organization', dataParsed.error)
      return c.json({ status: 'Cannot get organization', error: dataParsed.error.message }, 500)
    }
    return c.json(dataParsed.data)
  }
}
