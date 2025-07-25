import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/v4-mini'
import { simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

const bodySchema = z.object({
  orgId: z.optional(z.string()),
  page: z.optional(z.number()),
})
const orgSchema = z.object({
  id: z.uuid(),
  created_by: z.uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  logo: z.nullable(z.string()),
  name: z.string(),
  management_email: z.email(),
  customer_id: z.nullable(z.string()),
})

export async function get(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  if (body.orgId && !(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string))) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
  }

  if (body.orgId) {
    if (!apikeyHasOrgRight(apikey, body.orgId)) {
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
    }
    const { data, error } = await supabaseApikey(c, c.get('capgkey') as string)
      .from('orgs')
      .select('*')
      .eq('id', body.orgId)
      .single()
    if (error) {
      throw simpleError('cannot_get_organization', 'Cannot get organization', { error })
    }
    const dataParsed = orgSchema.safeParse(data)
    if (!dataParsed.success) {
      throw simpleError('cannot_parse_organization', 'Cannot parse organization', { error: dataParsed.error })
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
      throw simpleError('cannot_get_organizations', 'Cannot get organizations', { error })
    }
    const dataParsed = z.array(orgSchema).safeParse(data)
    if (!dataParsed.success) {
      throw simpleError('cannot_parse_organizations', 'Cannot parse organizations', { error: dataParsed.error })
    }
    return c.json(dataParsed.data)
  }
}
