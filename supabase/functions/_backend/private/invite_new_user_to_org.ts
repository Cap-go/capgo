import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import dayjs from 'dayjs'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { trackBentoEvent } from '../utils/bento.ts'
import { middlewareAuth, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseClient } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

// Validate name to prevent HTML/script injection
// Allow Unicode letters from all languages, spaces, hyphens, and apostrophes
// Rejects numbers, URLs, and most special characters while supporting international names
const nameRegex = /^[\p{L}\s'-]+$/u

// Define the schema for the invite user request
const inviteUserSchema = z.object({
  email: z.email(),
  org_id: z.string().check(z.minLength(1)),
  invite_type: z.enum(['read', 'upload', 'write', 'admin', 'super_admin']),
  captcha_token: z.string().check(z.minLength(1)),
  first_name: z.string().check(z.minLength(1), z.regex(nameRegex, 'First name contains invalid characters')),
  last_name: z.string().check(z.minLength(1), z.regex(nameRegex, 'Last name contains invalid characters')),
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
    return simpleError('invalid_request', 'Invalid request', { errors: z.prettifyError(validationResult.error) })
  }

  const body = validationResult.data
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org validated body', body })

  const authorization = c.get('authorization')
  if (!authorization)
    return { message: 'not authorized', status: 401 }

  // Verify captcha token with Cloudflare Turnstile
  await verifyCaptchaToken(c, body.captcha_token)

  // Use authenticated client - RLS will enforce access based on JWT
  const supabase = supabaseClient(c, authorization)

  // Check if the user already exists
  const { data: existingUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', body.email)
    .single()

  // Create the invitation record in the database
  if (existingUser || !userError) {
    return { message: 'Failed to invite user', error: 'User already exists', status: 500 }
  }

  // Get org - RLS will block if user doesn't have access
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', body.org_id)
    .single()

  if (orgError || !org) {
    return { message: 'Failed to invite user', error: orgError?.message ?? 'Organization not found', status: 500 }
  }

  // Get current user ID from JWT
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user?.id) {
    return { message: 'Failed to get current user', error: authError?.message, status: 500 }
  }

  // Get user details
  const { data: inviteCreatorUser, error: inviteCreatorUserError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single()

  if (inviteCreatorUserError) {
    return { message: 'Failed to invite user', error: inviteCreatorUserError.message, status: 500 }
  }
  return { inviteCreatorUser, org, body, authorization }
}

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await parseBody<any>(c)
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org raw body', rawBody })

  const res = await validateInvite(c, rawBody)
  if (!res.inviteCreatorUser) {
    return simpleError('failed_to_invite_user', 'Failed to invite user', { }, res.error ?? 'Failed to invite user')
  }
  if (!res.org) {
    return quickError(404, 'organization_not_found', 'Organization not found')
  }
  if (!res.body) {
    return quickError(400, 'invalid_body', 'Invalid request body')
  }
  const body = res.body
  const inviteCreatorUser = res.inviteCreatorUser
  const org = res.org

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseClient(c, res.authorization!)

  const { data: existingInvitation } = await supabase
    .from('tmp_users')
    .select('*')
    .eq('email', body.email)
    .eq('org_id', body.org_id)
    .single()

  let newInvitation: Database['public']['Tables']['tmp_users']['Row'] | null = null
  if (existingInvitation) {
    const nowMinusThreeHours = dayjs().subtract(3, 'hours')
    if (!dayjs(nowMinusThreeHours).isAfter(dayjs(existingInvitation.cancelled_at))) {
      return simpleError('user_already_invited', 'User already invited and it hasnt been 3 hours since the last invitation was cancelled')
    }

    const { error: updateInvitationError, data: updatedInvitationData } = await supabase
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
      return simpleError('failed_to_invite_user', 'Failed to invite user', { }, updateInvitationError.message)
    }

    newInvitation = updatedInvitationData
  }
  else {
    const { error: createUserError, data: newInvitationData } = await supabase.from('tmp_users').insert({
      email: body.email,
      org_id: body.org_id,
      role: body.invite_type,
      first_name: body.first_name,
      last_name: body.last_name,
    }).select('*').single()

    if (createUserError) {
      return simpleError('failed_to_invite_user', 'Failed to invite user', { }, createUserError.message)
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
    return simpleError('failed_to_invite_user', 'Failed to invite user', { }, 'Failed to track bento event')
  }
  return c.json({ status: 'User invited successfully' })
})

// Function to verify Cloudflare Turnstile token
async function verifyCaptchaToken(c: Context, token: string) {
  const captchaSecret = getEnv(c, 'CAPTCHA_SECRET_KEY')
  if (!captchaSecret) {
    return simpleError('captcha_secret_key_not_set', 'CAPTCHA_SECRET_KEY not set')
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
    return simpleError('invalid_captcha', 'Invalid captcha result')
  }
  cloudlog({ requestId: c.get('requestId'), context: 'captcha_result', captchaResultData })
  if (captchaResultData.data.success !== true) {
    return simpleError('invalid_captcha', 'Invalid captcha result')
  }
}
