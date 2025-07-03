import type { Context } from 'hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { simpleError } from '../../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../../utils/loggin.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin } from '../../../utils/supabase.ts'

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
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const { data, error } = await supabaseAdmin(c)
    .rpc('get_org_members', {
      user_id: apikey.user_id,
      guild_id: body.orgId,
    })

  cloudlog({ requestId: c.get('requestId'), message: 'data', data, error })
  if (error) {
    throw simpleError('cannot_get_organization_members', 'Cannot get organization members', { error })
  }

  const parsed = memberSchema.safeParse(data)
  if (!parsed.success) {
    throw simpleError('cannot_parse_members', 'Cannot parse members', { error: parsed.error })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'Members', data: parsed.data })
  return c.json(parsed.data)
}
