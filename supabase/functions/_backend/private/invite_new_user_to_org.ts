import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { HTTPError } from 'ky'
import { z } from 'zod'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'
import { trackBentoEvent } from '../utils/bento.ts'
import dayjs from 'dayjs'
import type { Database } from '../utils/supabase.types.ts'

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

app.post('/', middlewareAuth, async (c) => {
  try {
    const rawBody = await c.req.json()
    console.log({ requestId: c.get('requestId'), context: 'invite_new_user_to_org raw body', rawBody })
    
    // Validate the request body using Zod
    const validationResult = inviteUserSchema.safeParse(rawBody)
    if (!validationResult.success) {
      console.error({ requestId: c.get('requestId'), context: 'validation_error', error: validationResult.error.format() })
      return c.json({ status: 'Invalid request', errors: validationResult.error.format() }, 400)
    }
    
    const body = validationResult.data
    console.log({ requestId: c.get('requestId'), context: 'invite_new_user_to_org validated body', body })
    
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c as any).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (error || !auth || !auth.user || !auth.user.id)
      return c.json({ status: 'not authorized' }, 401)

    // Verify the user has permission to invite
    // inviting super_admin is only allowed for super_admin
    if (!await hasOrgRight(c as any, body.org_id, auth.user.id, body.invite_type !== 'super_admin' ? 'admin' : 'super_admin'))
      return c.json({ status: 'not authorized (insufficient permissions)' }, 403)

    // Verify captcha token with Cloudflare Turnstile
    const captchaVerified = await verifyCaptchaToken(c, body.captcha_token)
    if (!captchaVerified)
      return c.json({ status: 'Invalid captcha' }, 400)

    // Check if the user already exists
    const { data: existingUser, error: userError } = await supabaseAdmin(c as any)
      .from('users')
      .select('*')
      .eq('email', body.email)
      .single()

    // Create the invitation record in the database
    if (existingUser || !userError) {
      return c.json({ status: 'Failed to invite user', error: 'User already exists' }, 500)
    }

    const { data: org, error: orgError } = await supabaseAdmin(c as any)
      .from('orgs')
      .select('*')
      .eq('id', body.org_id)
      .single()

    if (orgError) {
      return c.json({ status: 'Failed to invite user', error: orgError.message }, 500)
    }

    const { data: inviteCreatorUser, error: inviteCreatorUserError } = await supabaseAdmin(c as any)
      .from('users')
      .select('*')
      .eq('id', auth.user.id)
      .single()

    if (inviteCreatorUserError) {
      return c.json({ status: 'Failed to invite user', error: inviteCreatorUserError.message }, 500)
    }

    const { data: existingInvitation } = await supabaseAdmin(c as any)
      .from('tmp_users')
      .select('*')
      .eq('email', body.email)
      .eq('org_id', body.org_id)
      .single()

    let newInvitation: Database['public']['Tables']['tmp_users']['Row'] | null = null
    if (existingInvitation) {
      const nowMinusThreeHours = dayjs().subtract(3, 'hours')
      if (!dayjs(nowMinusThreeHours).isAfter(dayjs(existingInvitation.cancelled_at))) {
        return c.json({ status: 'Failed to invite user', error: 'User already invited and it hasnt been 3 hours since the last invitation was cancelled' }, 400)
      }

      const { error: updateInvitationError, data: updatedInvitationData } = await supabaseAdmin(c as any)
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
        return c.json({ status: 'Failed to invite user', error: updateInvitationError.message }, 500)
      }

      newInvitation = updatedInvitationData
    } else {
      const { error: createUserError, data: newInvitationData } = await supabaseAdmin(c as any).from('tmp_users').insert({
        email: body.email,
        org_id: body.org_id,
        role: body.invite_type,
        first_name: body.first_name,
        last_name: body.last_name,
      }).select('*').single()
  
      if (createUserError) {
        return c.json({ status: 'Failed to invite user', error: createUserError.message }, 500)
      }

      newInvitation = newInvitationData
    }

    const bentoEvent = await trackBentoEvent(c as any, body.email, { 
      org_admin_name: `${inviteCreatorUser.first_name} ${inviteCreatorUser.last_name}`,
      org_name: org.name,
      invite_link: `${getEnv(c as any, 'WEBAPP_URL')}/invitation?invite_magic_string=${newInvitation?.invite_magic_string}`,
      invited_first_name: `${body.first_name}`,
      invited_last_name: `${body.last_name}`,
    }, 'org:invite_new_capgo_user_to_org')
    console.log({ requestId: c.get('requestId'), context: 'bento_event', bentoEvent })
    if (!bentoEvent) {
      console.error({ requestId: c.get('requestId'), context: 'bento_event_error', error: 'Failed to track bento event' })
      return c.json({ status: 'Failed to invite user', error: 'Failed to track bento event' }, 500)
    }
    return c.json({ status: 'User invited successfully' })
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'error', error })
    if (error instanceof HTTPError) {
      const errorJson = await error.response.json()
      return c.json({ status: 'Failed to invite user', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Failed to invite user', error: JSON.stringify(error) }, 500)
    }
  }
})

// Function to verify Cloudflare Turnstile token
async function verifyCaptchaToken(c: any, token: string): Promise<boolean> {
  try {
    const captchaSecret = getEnv(c, 'CAPTCHA_SECRET_KEY')
    if (!captchaSecret) {
      console.error({ requestId: c.get('requestId'), context: 'captcha_error', error: 'CAPTCHA_SECRET_KEY not set' })
      return false
    }

    // "/siteverify" API endpoint.
    const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const result = await fetch(url, {
      body: JSON.stringify({
        secret: captchaSecret,
        response: token,
      }),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const captchaResult = await result.json()
    const captchaResultData = captchaSchema.safeParse(captchaResult)
    if (!captchaResultData.success) {
      console.error({ requestId: c.get('requestId'), context: 'captcha_error', error: 'Invalid captcha result' })
      return false
    }
    console.log({ requestId: c.get('requestId'), context: 'captcha_result', captchaResultData })
    return captchaResultData.data.success === true
  } catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'captcha_verify_error', error })
    return false
  }
}
