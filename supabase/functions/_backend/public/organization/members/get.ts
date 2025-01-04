import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { getPgClient } from '../../../utils/pg.ts'
import { apikeyHasOrgRight, hasOrgRightApikey } from '../../../utils/supabase.ts'

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
  if (!bodyParsed.success)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId)))
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)

  const pgClient = getPgClient(c)
  try {
    const result = await pgClient`
      SELECT users.id as uid, users.email, users.image_url, o.user_right as role 
      FROM org_users as o 
      JOIN users ON users.id = o.user_id 
      WHERE o.org_id=${body.orgId} 
      AND (is_member_of_org(users.id, o.org_id) OR is_owner_of_org(users.id, o.org_id))
    `

    const parsed = memberSchema.safeParse(result)
    if (!parsed.success) {
      return c.json({ status: 'Cannot get organization members', error: parsed.error.message }, 500)
    }
    return c.json(parsed.data)
  }
  catch (error) {
    await pgClient.end()
    return c.json({ status: 'Cannot get members', error: error.message }, 500)
  }
}
