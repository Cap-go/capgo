import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { createSignedImageUrl } from '../../../utils/storage.ts'
import { supabaseApikey } from '../../../utils/supabase.ts'
import { checkPermission } from '../../../utils/rbac.ts'

const bodySchema = z.object({
  orgId: z.string(),
})

const memberSchema = z.array(z.object({
  uid: z.uuid(),
  email: z.email(),
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
  is_tmp: z.boolean(),
}))

export async function get(c: Context<MiddlewareKeyVariables>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.read_members', { orgId: body.orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)
  const { data, error } = await supabase
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
  const signedMembers = await Promise.all(parsed.data.map(async (member) => {
    if (!member.image_url)
      return member
    const signedImage = await createSignedImageUrl(c, member.image_url)
    return {
      ...member,
      image_url: signedImage ?? '',
    }
  }))

  cloudlog({ requestId: c.get('requestId'), message: 'Members', data: signedMembers })
  return c.json(signedMembers)
}
