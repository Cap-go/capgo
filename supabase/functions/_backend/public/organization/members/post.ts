import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { BRES, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { checkPermission } from '../../../utils/rbac.ts'
import { supabaseApikey } from '../../../utils/supabase.ts'

const inviteBodySchema = z.object({
  orgId: z.string(),
  email: z.email(),
  invite_type: z.enum([
    'read',
    'upload',
    'write',
    'admin',
    'super_admin',
  ]),
})

export async function post(c: Context<MiddlewareKeyVariables>, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = inviteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.invite_user', { orgId: body.orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  const { data, error } = await supabase
    .rpc('invite_user_to_org', {
      email: body.email,
      org_id: body.orgId,
      invite_type: `invite_${body.invite_type}`,
    })

  if (error) {
    throw simpleError('error_inviting_user_to_organization', 'Error inviting user to organization', { error })
  }
  if (data && data !== 'OK') {
    throw simpleError('error_inviting_user_to_organization', 'Error inviting user to organization', { data })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'User invited to organization', data: { email: body.email, org_id: body.orgId } })
  return c.json(BRES)
}
