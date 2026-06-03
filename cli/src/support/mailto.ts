// mailto: URLs are length-limited by mail clients in practice; keep the body small.
// Full logs go in the attachment, never the body.
export const MAILTO_BODY_MAX = 1500

export interface MailtoParams {
  to: string
  subject: string
  body: string
}

export function buildMailtoUrl(params: MailtoParams): string {
  let body = params.body
  if (body.length > MAILTO_BODY_MAX) {
    const marker = '…(truncated)'
    body = body.slice(0, MAILTO_BODY_MAX - marker.length) + marker
  }
  const subject = encodeURIComponent(params.subject)
  const encodedBody = encodeURIComponent(body)
  return `mailto:${params.to}?subject=${subject}&body=${encodedBody}`
}
