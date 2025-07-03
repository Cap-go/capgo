import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import dayjs from 'dayjs'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { trackBentoEvent } from '../utils/bento.ts'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

// Define the schema for the invite user request
const inviteUserSchema = z.object({
  email: z.string().email(),
  org_id: z.string().min(1),
  invite_type: z.enum(['read', 'upload', 'write', 'admin', 'super_admin']),
  captcha_token: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
})

const captchaSchema = z.object({
  success: z.boolean(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function validateInvite(c: Context, rawBody: any) {
  // Validate the request body using Zod
  const validationResult = inviteUserSchema.safeParse(rawBody)
  if (!validationResult.success) {
    throw simpleError('invalid_request', 'Invalid request', { errors: validationResult.error.format() })
  }

  const body = validationResult.data
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org validated body', body })

  const authorization = c.get('authorization')
  const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
    authorization?.split('Bearer ')[1],
  )

  if (error || !auth?.user?.id)
    return { message: 'not authorized', status: 401 }

  // Verify the user has permission to invite
  // inviting super_admin is only allowed for super_admin
  if (!await hasOrgRight(c, body.org_id, auth.user.id, body.invite_type !== 'super_admin' ? 'admin' : 'super_admin'))
    return { message: 'not authorized (insufficient permissions)', status: 403 }

  // Verify captcha token with Cloudflare Turnstile
  await verifyCaptchaToken(c, body.captcha_token)

  // Check if the user already exists
  const { data: existingUser, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('*')
    .eq('email', body.email)
    .single()

  // Create the invitation record in the database
  if (existingUser || !userError) {
    return { message: 'Failed to invite user', error: 'User already exists', status: 500 }
  }

  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select('*')
    .eq('id', body.org_id)
    .single()

  if (orgError || !org) {
    return { message: 'Failed to invite user', error: orgError.message, status: 500 }
  }

  const { data: inviteCreatorUser, error: inviteCreatorUserError } = await supabaseAdmin(c)
    .from('users')
    .select('*')
    .eq('id', auth.user.id)
    .single()

  if (inviteCreatorUserError) {
    return { message: 'Failed to invite user', error: inviteCreatorUserError.message, status: 500 }
  }
  return { inviteCreatorUser, org, body }
}

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await c.req.json()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org raw body', rawBody })

  const res = await validateInvite(c, rawBody)
  if (!res.inviteCreatorUser) {
    throw simpleError('failed_to_invite_user', 'Failed to invite user', { }, res.error ?? 'Failed to invite user')
  }
  if (!res.org) {
    throw simpleError('organization_not_found', 'Organization not found')
  }
  const body = res.body
  const inviteCreatorUser = res.inviteCreatorUser
  const org = res.org

  const { data: existingInvitation } = await supabaseAdmin(c)
    .from('tmp_users')
    .select('*')
    .eq('email', body.email)
    .eq('org_id', body.org_id)
    .single()

  let newInvitation: Database['public']['Tables']['tmp_users']['Row'] | null = null
  if (existingInvitation) {
    const nowMinusThreeHours = dayjs().subtract(3, 'hours')
    if (!dayjs(nowMinusThreeHours).isAfter(dayjs(existingInvitation.cancelled_at))) {
      throw simpleError('user_already_invited', 'User already invited and it hasnt been 3 hours since the last invitation was cancelled')
    }

    const { error: updateInvitationError, data: updatedInvitationData } = await supabaseAdmin(c)
      .from('tmp_users')
      .update({
        cancelled_at: null,
        first_name: body.first_name,
        last_name: body.last_name,
      })
      .eq('email', body.email)
      .eq('org_id', body.org_id)
      .select('*')
      .single()

    if (updateInvitationError) {
      throw simpleError('failed_to_invite_user', 'Failed to invite user', { }, updateInvitationError.message)
    }

    newInvitation = updatedInvitationData
  }
  else {
    const { error: createUserError, data: newInvitationData } = await supabaseAdmin(c).from('tmp_users').insert({
      email: body.email,
      org_id: body.org_id,
      role: body.invite_type,
      first_name: body.first_name,
      last_name: body.last_name,
    }).select('*').single()

    if (createUserError) {
      throw simpleError('failed_to_invite_user', 'Failed to invite user', { }, createUserError.message)
    }

    newInvitation = newInvitationData
  }

  const bentoEvent = await trackBentoEvent(c, body.email, {
    org_admin_name: `${inviteCreatorUser.first_name} ${inviteCreatorUser.last_name}`,
    org_name: org.name,
    invite_link: `${getEnv(c, 'WEBAPP_URL')}/invitation?invite_magic_string=${newInvitation?.invite_magic_string}`,
    invited_first_name: `${body.first_name}`,
    invited_last_name: `${body.last_name}`,
  }, 'org:invite_new_capgo_user_to_org')
  if (!bentoEvent) {
    throw simpleError('failed_to_invite_user', 'Failed to invite user', { }, 'Failed to track bento event')
  }
  return c.json({ status: 'User invited successfully' })
})

// Function to verify Cloudflare Turnstile token
async function verifyCaptchaToken(c: any, token: string) {
  const captchaSecret = getEnv(c, 'CAPTCHA_SECRET_KEY')
  if (!captchaSecret) {
    throw simpleError('captcha_secret_key_not_set', 'CAPTCHA_SECRET_KEY not set')
  }

  // "/siteverify" API endpoint.
  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  const result = await fetch(url, {
    body: JSON.stringify({
      secret: captchaSecret,
      response: token,
    }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const captchaResult = await result.json()
  const captchaResultData = captchaSchema.safeParse(captchaResult)
  if (!captchaResultData.success) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
  cloudlog({ requestId: c.get('requestId'), context: 'captcha_result', captchaResultData })
  if (captchaResultData.data.success !== true) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
}
