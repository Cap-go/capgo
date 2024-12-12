import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const inviteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
  invite_type: z.enum([
    'read',
    'upload',
    'write',
    'admin',
    'super_admin',
  ]),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = inviteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', apikey.key)))
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  const { data, error } = await supabase
    .rpc('invite_user_to_org', {
      email: body.email,
      org_id: body.orgId,
      invite_type: `invite_${body.invite_type}`,
    })

  if (data && data === 'OK')
    return c.json({ status: data }, 200)
  return c.json({ error, status: data }, 400)
}
