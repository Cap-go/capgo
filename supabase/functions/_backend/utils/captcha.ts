import type { Context } from 'hono'
import type { SafeParseSchemaResult } from './ark_validation.ts'
import { type } from 'arktype'
import { safeParseSchema } from './ark_validation.ts'
import { simpleError } from './hono.ts'
import { cloudlog } from './logging.ts'

const captchaSchema = type({
  success: 'boolean',
})

interface CaptchaResult {
  success: boolean
}

function getCaptchaLogMetadata(captchaResultData: SafeParseSchemaResult<CaptchaResult>) {
  return {
    parsed: captchaResultData.success,
    success: captchaResultData.success ? captchaResultData.data.success : undefined,
  }
}

export async function verifyCaptchaToken(c: Context, token: string, captchaSecret: string) {
  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  const result = await fetch(url, {
    body: new URLSearchParams({
      secret: captchaSecret,
      response: token,
    }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const captchaResult = await result.json()
  const captchaResultData = safeParseSchema(captchaSchema, captchaResult)
  if (!captchaResultData.success) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
  cloudlog({
    requestId: c.get('requestId'),
    context: 'captcha_result',
    captchaResult: getCaptchaLogMetadata(captchaResultData),
  })
  if (captchaResultData.data.success !== true) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
}
