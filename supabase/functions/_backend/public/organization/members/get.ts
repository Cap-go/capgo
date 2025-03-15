import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
})

const memberSchema = z.object({
  uid: z.string().uuid(),
  email: z.string().email(),
  image_url: z.string(),
  role: z.enum([
    'invite_read',
    'invite_upload',
    'invite_write',
    'invite_admin',
    'invite_super_admin',
    'read',
    'upload',
    'write',
    'admin',
    'super_admin',
  ]),
}).array()

export async function get(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  try {
    const { data, error } = await supabaseApikey(c, apikey.key)
      .rpc('get_org_members', {
        user_id: apikey.user_id,
        guild_id: body.orgId,
      })

    console.log('data', data, error)
    if (error) {
      console.error('Cannot get organization members', error)
      return c.json({ status: 'Cannot get organization members', error: error.message }, 500)
    }

    const parsed = memberSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Cannot parse members', parsed.error)
      return c.json({ status: 'Cannot get organization members', error: parsed.error.message }, 500)
    }
    console.log('Members', parsed.data)
    return c.json(parsed.data)
  }
  catch (error) {
    console.error('Cannot get members', error)
    return c.json({ status: 'Cannot get members', error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
}
