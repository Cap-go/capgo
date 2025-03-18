import type { Context } from '@hono/hono'
import type { Database } from '../../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin } from '../../../../utils/supabase.ts'

const createUserSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  first_name: z.string(),
  last_name: z.string(),
  invite_type: z.enum([
    'invite_read',
    'invite_upload',
    'invite_write',
    'invite_admin',
    'invite_super_admin',
  ]),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = createUserSchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', apikey.key)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

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
    const { data: _, error: addToOrgError } = await supabaseAdmin(c)
      .rpc('add_user_to_org_after_creation', {
        user_id: userData.user.id,
        org_id: body.orgId,
        invite_type: body.invite_type,
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
