import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../supabase/functions/_backend/utils/hono.ts'
import type { EmailContent } from './render.ts'
import { quickError } from '../../../supabase/functions/_backend/utils/hono.ts'
import { cloudlog } from '../../../supabase/functions/_backend/utils/logging.ts'

export async function sendCloudflareEmail(c: Context<MiddlewareKeyVariables>, email: string, content: EmailContent, metadata: Record<string, string>) {
  const emailBinding = c.env?.AUTH_EMAIL
  if (!emailBinding)
    quickError(500, 'cloudflare_email_unavailable', 'Cloudflare Email Sending is unavailable')

  const result = await emailBinding.send({ to: email, from: 'noreply@capgo.app', ...content })
  cloudlog({ requestId: c.get('requestId'), message: 'email accepted by Cloudflare', ...metadata, messageId: result.messageId })
  return result.messageId
}
