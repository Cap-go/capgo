import type { Context } from '@hono/hono'
import type { AuthInfo } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRight, hasOrgRightApikey, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

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
  // Optional fields for user creation
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  create_if_not_exists: z.boolean().optional(),
})

export async function post(c: Context, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row'] | null) {
  const bodyParsed = inviteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  if (auth.authType === 'apikey') {
    // For API key auth
    if (!(await hasOrgRightApikey(c, body.orgId, auth.userId, 'admin', auth.apikey!.key)) || !(apikeyHasOrgRight(auth.apikey!, body.orgId))) {
      console.error('You can\'t access this organization', body.orgId)
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId, error: 'Insufficient permissions or invalid organization ID' }, 400)
    }
  }
  else {
    // For JWT auth
    if (!(await hasOrgRight(c, body.orgId, auth.userId, 'admin'))) {
      console.error('You can\'t access this organization', body.orgId)
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId, error: 'Insufficient permissions or invalid organization ID' }, 400)
    }
  }

  // If create_if_not_exists is true and first_name/last_name are provided, try to create the user directly
  if (body.create_if_not_exists && body.first_name && body.last_name) {
    try {
      // Generate a random password (will be reset by user via email verification)
      const password = crypto.randomUUID()

      // Create the user with Supabase Admin SDK
      const { data: userData, error: createUserError } = await supabaseAdmin(c).auth.admin.createUser({
        email: body.email,
        password,
        email_confirm: false, // User still needs to verify email
        user_metadata: {
          first_name: body.first_name,
          last_name: body.last_name,
          activation: {
            formFilled: true,
            enableNotifications: false,
            legal: false,
            optForNewsletters: false,
          },
        },
      })

      if (createUserError || !userData.user) {
        console.error('Error creating user:', createUserError)
        return c.json({ error: createUserError, status: 'ERROR_CREATING_USER' }, 400)
      }

      // Add user to organization
      const { data: _addToOrgResult, error: addToOrgError } = await supabaseAdmin(c)
        .rpc('add_user_to_org_after_creation', {
          user_id: userData.user.id,
          org_id: body.orgId,
          invite_type: `invite_${body.invite_type}`,
        })

      if (addToOrgError) {
        console.error('Error adding user to organization:', addToOrgError)
        return c.json({ error: addToOrgError, status: 'ERROR_ADDING_TO_ORG' }, 400)
      }

      console.log('User created and added to organization', body.email, body.orgId)
      return c.json({ status: 'OK' }, 200)
    }
    catch (error) {
      console.error('Unexpected error creating user:', error)
      return c.json({ error, status: 'UNEXPECTED_ERROR' }, 500)
    }
  }

  // Standard invitation flow
  const supabase = auth.authType === 'apikey'
    ? supabaseApikey(c, auth.apikey!.key)
    : supabaseAdmin(c)

  const { data, error } = await supabase
    .rpc('invite_user_to_org_wrapper', {
      email: body.email,
      org_id: body.orgId,
      invite_type: `invite_${body.invite_type}`,
    })

  if (error) {
    console.error('Error inviting user to organization', error)
    return c.json({ error, status: 'KO' }, 400)
  }
  if (data && data !== 'OK') {
    console.error('Error inviting user to organization', data)
    return c.json({ error, status: data }, 400)
  }
  console.log('User invited to organization', body.email, body.orgId)
  return c.json({ status: data }, 200)
}
