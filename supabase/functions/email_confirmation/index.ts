import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { Hono } from 'hono/tiny'
import { supabaseAdmin } from '../_backend/utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  try {
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')
    const type = url.searchParams.get('type')
    const redirectTo = url.searchParams.get('redirect_to') || '/'

    if (!token || type !== 'email_change') {
      return c.redirect(`${url.origin}${redirectTo}`)
    }

    const supabase = await supabaseAdmin(c as any)

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'email_change',
    })

    if (verifyError || !verifyData.user) {
      console.error({ requestId: c.get('requestId'), context: 'Error verifying email change token', error: verifyError })
      return c.redirect(`${url.origin}/error?message=Invalid or expired token`)
    }

    const userId = verifyData.user.id
    const newEmail = verifyData.user.email

    if (!newEmail) {
      console.error({ requestId: c.get('requestId'), context: 'No email found in verified user data' })
      return c.redirect(`${url.origin}/error?message=Email verification failed`)
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ email: newEmail })
      .eq('id', userId)

    if (updateError) {
      console.error({ requestId: c.get('requestId'), context: 'Error updating user email in database', error: updateError })
    }

    return c.redirect(`${url.origin}${redirectTo}`)
  } catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'Error processing email confirmation', error })
    return c.redirect(`${new URL(c.req.url).origin}/error?message=An error occurred`)
  }
})
