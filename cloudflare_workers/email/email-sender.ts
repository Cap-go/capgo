import type { Env } from './types'

interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
  inReplyTo?: string
  references?: string[]
}

/**
 * Sends an email using Resend
 * Supports multiple email addresses and proper reply threading
 */
export async function sendEmail(
  env: Env,
  options: EmailOptions,
): Promise<boolean> {
  try {
    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return false
    }

    return await sendViaResend(env, options)
  }
  catch (error) {
    console.error('Error sending email:', error)
    return false
  }
}

/**
 * Sends email via Resend API (recommended - better deliverability and threading support)
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendViaResend(
  env: Env,
  options: EmailOptions,
): Promise<boolean> {
  try {
    const payload: any = {
      from: formatEmailAddress(env.EMAIL_FROM_ADDRESS, env.EMAIL_FROM_NAME),
      to: [options.to],
      subject: options.subject,
      text: options.text,
    }

    // Add HTML if provided
    if (options.html) {
      payload.html = options.html
    }

    // Add threading headers for replies
    if (options.inReplyTo) {
      payload.headers = {
        'In-Reply-To': options.inReplyTo,
        'References': options.references
          ? options.references.join(' ')
          : options.inReplyTo,
      }
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend API error:', response.status, error)
      return false
    }

    const result = await response.json() as { id?: string }
    console.log('Email sent via Resend:', result.id)
    return true
  }
  catch (error) {
    console.error('Resend error:', error)
    return false
  }
}

/**
 * Formats an email address with optional name
 */
function formatEmailAddress(email: string, name?: string): string {
  if (name)
    return `"${name}" <${email}>`
  return email
}

/**
 * Builds a multipart email body
 */
function buildMultipartBody(boundary: string, text: string, html: string): string {
  return [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n')
}

/**
 * Formats a Discord message as email text
 */
export function formatDiscordMessageAsEmail(
  username: string,
  content: string,
  threadSubject: string,
): EmailOptions {
  const text = `${username} replied to your message:\n\n${content}\n\n---\nSubject: ${threadSubject}\nReplied via Discord`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #5865F2; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
        <h2 style="margin: 0;">Discord Reply</h2>
      </div>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 0 0 5px 5px;">
        <p><strong>${username}</strong> replied to your message:</p>
        <blockquote style="border-left: 3px solid #5865F2; padding-left: 15px; margin: 20px 0;">
          ${escapeHtml(content)}
        </blockquote>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
          Subject: ${escapeHtml(threadSubject)}<br>
          Replied via Discord
        </p>
      </div>
    </div>
  `

  return {
    to: '',
    subject: `Re: ${threadSubject}`,
    text,
    html,
  }
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
