import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { HTTPError } from 'ky'
import { z } from 'zod'
import { useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

// Define the schema for the accept invitation request
const acceptInvitationSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters').regex(/[A-Z]/, 'Password must contain at least one uppercase letter').regex(/\d/, 'Password must contain at least one number').regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?].*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Password must contain at least two special characters'),
  magic_invite_string: z.string().min(1, 'Magic invite string is required'),
  optForNewsletters: z.boolean(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', async (c) => {
  try {
    const rawBody = await c.req.json()
    cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation raw body', rawBody })

    // Validate the request body using Zod
    const validationResult = acceptInvitationSchema.safeParse(rawBody)
    if (!validationResult.success) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'validation_error', error: validationResult.error.format() })
      return c.json({ status: 'Invalid request', errors: validationResult.error.format() }, 400)
    }

    const body = validationResult.data
    cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation validated body', body })

    // For now, we're just doing validation without additional logic
    // This will be expanded with the actual invitation acceptance logic

    const supabaseAdmin = useSupabaseAdmin(c as any)
    const { data: invitation, error: invitationError } = await supabaseAdmin.from('tmp_users')
      .select('*')
      .eq('invite_magic_string', body.magic_invite_string)
      .single()

    if (invitationError) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: invitationError })
      return c.json({ status: 'Failed to accept invitation', error: invitationError.message }, 500)
    }

    if (!invitation) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: 'Invitation not found' })
      return c.json({ status: 'Failed to accept invitation', error: 'Invitation not found' }, 404)
    }

    // here the real magic happens
    const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password: body.password,
      email_confirm: true,
      id: invitation.future_uuid,
      user_metadata: {
        activation: {
          formFilled: true,
          enableNotifications: false,
          legal: true,
          optForNewsletters: false,
        },
      },
    })

    if (userError || !user) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: userError })
      return c.json({ status: 'Failed to accept invitation', error: userError?.message ?? 'Unknown error' }, 500)
    }

    // TODO: improve error handling
    const { error: userNormalTableError } = await supabaseAdmin.from('users').insert({
      id: user.user.id,
      email: invitation.email,
      name: user.user.user_metadata.name,
      avatar_url: user.user.user_metadata.avatar_url,
      first_name: invitation.first_name,
      last_name: invitation.last_name,
      legalAccepted: false,
      optForNewsletters: body.optForNewsletters,
    })

    if (userNormalTableError) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: userNormalTableError })
      return c.json({ status: 'Failed to accept invitation', error: userNormalTableError.message }, 500)
    }

    // let's now login the user in. The rough idea is that we will create a session and then return the session to the client
    // then the client will use the session to redirect to login page.
    const userSupabase = emptySupabase(c as any)
    const { data: session, error: sessionError } = await userSupabase.auth.signInWithPassword({
      email: invitation.email,
      password: body.password,
    })

    if (sessionError) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: sessionError })
      return c.json({ status: 'Failed to accept invitation', error: sessionError.message }, 500)
    }

    // We are still not finished. We need to remove from tmp_users and accept the invitation
    const { error: tmpUserDeleteError } = await supabaseAdmin.from('tmp_users').delete().eq('invite_magic_string', body.magic_invite_string)
    if (tmpUserDeleteError) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: tmpUserDeleteError })
      return c.json({ status: 'Failed to accept invitation', error: tmpUserDeleteError.message }, 500)
    }

    const { error: insertIntoMainTableError } = await supabaseAdmin.from('org_users').insert({
      user_id: user.user.id,
      org_id: invitation.org_id,
      user_right: invitation.role,
    })

    if (insertIntoMainTableError) {
      cloudlogErr({ requestId: c.get('requestId'), context: 'error', error: insertIntoMainTableError })
      return c.json({ status: 'Failed to accept invitation', error: insertIntoMainTableError.message }, 500)
    }

    return c.json({
      access_token: session.session?.access_token,
      refresh_token: session.session?.refresh_token,
    })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), context: 'error', error })
    if (error instanceof HTTPError) {
      const errorJson = await error.response.json()
      return c.json({ status: 'Failed to accept invitation', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Failed to accept invitation', error: JSON.stringify(error) }, 500)
    }
  }
})
