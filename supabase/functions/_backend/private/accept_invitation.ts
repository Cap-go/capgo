import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { type MiddlewareKeyVariables, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
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
  const rawBody = await c.req.json()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation raw body', rawBody })

  // Validate the request body using Zod
  const validationResult = acceptInvitationSchema.safeParse(rawBody)
  if (!validationResult.success) {
    throw simpleError('invalid_json_body', 'Invalid request', { errors: validationResult.error.format() })
  }

  const body = validationResult.data
  cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation validated body', body })

  // For now, we're just doing validation without additional logic
  // This will be expanded with the actual invitation acceptance logic

  const supabaseAdmin = useSupabaseAdmin(c)
  const { data: invitation, error: invitationError } = await supabaseAdmin.from('tmp_users')
    .select('*')
    .eq('invite_magic_string', body.magic_invite_string)
    .single()

  if (invitationError) {
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: invitationError.message })
  }

  if (!invitation) {
    throw quickError(404, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: 'Invitation not found' })
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
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: userError?.message ?? 'Unknown error' })
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
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: userNormalTableError.message })
  }

  // let's now login the user in. The rough idea is that we will create a session and then return the session to the client
  // then the client will use the session to redirect to login page.
  const userSupabase = emptySupabase(c)
  const { data: session, error: sessionError } = await userSupabase.auth.signInWithPassword({
    email: invitation.email,
    password: body.password,
  })

  if (sessionError) {
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: sessionError.message })
  }

  // We are still not finished. We need to remove from tmp_users and accept the invitation
  const { error: tmpUserDeleteError } = await supabaseAdmin.from('tmp_users').delete().eq('invite_magic_string', body.magic_invite_string)
  if (tmpUserDeleteError) {
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: tmpUserDeleteError.message })
  }

  const { error: insertIntoMainTableError } = await supabaseAdmin.from('org_users').insert({
    user_id: user.user.id,
    org_id: invitation.org_id,
    user_right: invitation.role,
  })

  if (insertIntoMainTableError) {
    throw quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation', { error: insertIntoMainTableError.message })
  }

  return c.json({
    access_token: session.session?.access_token,
    refresh_token: session.session?.refresh_token,
  })
})
