import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../../utils/ark_validation.ts'
import { quickError, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { checkPermission } from '../../../utils/rbac.ts'
import { createSignedImageUrl } from '../../../utils/storage.ts'
import { apikeyHasOrgRightWithPolicy, supabaseApikey } from '../../../utils/supabase.ts'

const bodySchema = type({
  orgId: 'string',
})

const memberSchema = type({
  uid: 'string.uuid',
  email: 'string.email',
  image_url: 'string | null | undefined',
  role: '"invite_read" | "invite_upload" | "invite_write" | "invite_admin" | "invite_super_admin" | "read" | "upload" | "write" | "admin" | "super_admin"',
  is_tmp: 'boolean',
}).array()

export async function get(c: Context<MiddlewareKeyVariables>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const auth = c.get('auth') as { apikey?: Database['public']['Tables']['apikeys']['Row'] } | undefined
  const effectiveApikey = auth?.apikey ?? apikey

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.read_members', { orgId: body.orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const supabase = supabaseApikey(c, effectiveApikey.key)
  const orgCheck = await apikeyHasOrgRightWithPolicy(c, effectiveApikey, body.orgId, supabase)
  if (!orgCheck.valid) {
    if (orgCheck.error === 'org_requires_expiring_key') {
      throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
    }
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Use authenticated client for data queries - RLS will enforce access
  const { data, error } = await supabase
    .rpc('get_org_members', {
      user_id: effectiveApikey.user_id,
      guild_id: body.orgId,
    })

  cloudlog({ requestId: c.get('requestId'), message: 'data', data, error })
  if (error) {
    throw simpleError('cannot_get_organization_members', 'Cannot get organization members', { error })
  }

  const parsed = safeParseSchema(memberSchema, data)
  if (!parsed.success) {
    throw simpleError('cannot_parse_members', 'Cannot parse members', { error: parsed.error })
  }
  const signedMembers = await Promise.all(parsed.data.map(async (member) => {
    if (!member.image_url) {
      return {
        ...member,
        image_url: '',
      }
    }
    const signedImage = await createSignedImageUrl(c, member.image_url)
    return {
      ...member,
      image_url: signedImage ?? '',
    }
  }))

  cloudlog({ requestId: c.get('requestId'), message: 'Members', data: signedMembers })
  return c.json(signedMembers)
}
