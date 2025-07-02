import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { cloudlogErr } from '../../utils/loggin.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

const bodySchema = z.object({
  orgId: z.string().optional(),
  page: z.number().optional(),
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid body', error: bodyParsed.error })
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (body.orgId && !(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this organization', org_id: body.orgId })
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  if (body.orgId) {
    if (!apikeyHasOrgRight(apikey, body.orgId)) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this organization', org_id: body.orgId })
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
    }
    const { data, error } = await supabaseApikey(c, c.get('capgkey') as string)
      .from('orgs')
      .select('*')
      .eq('id', body.orgId)
      .single()
    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get organization', error })
      return c.json({ status: 'Cannot get organization', error: error.message }, 500)
    }
    const dataParsed = orgSchema.safeParse(data)
    if (!dataParsed.success) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot parse organization', error: dataParsed.error })
      return c.json({ status: 'Cannot get organization', error: dataParsed.error.message }, 500)
    }
    return c.json(dataParsed.data)
  }
  else {
    const fetchOffset = body.page ?? 0
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1

    const { data, error } = await supabaseApikey(c, c.get('capgkey') as string)
      .from('orgs')
      .select('*')
      .range(from, to)
    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get organizations', error })
      return c.json({ status: 'Cannot get organizations', error: error.message }, 500)
    }
    const dataParsed = orgSchema.array().safeParse(data)
    if (!dataParsed.success) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot parse organization', error: dataParsed.error })
      return c.json({ status: 'Cannot get organization', error: dataParsed.error.message }, 500)
    }
    return c.json(dataParsed.data)
  }
}
