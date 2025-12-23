import type { Env } from './types'

interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
  inReplyTo?: string
  references?: string[]
  messageId?: string // Custom Message-ID to use for this email
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
    if (options.inReplyTo || options.messageId) {
      const headers: Record<string, string> = {}

      // Add custom Message-ID if provided
      if (options.messageId) {
        const messageId = options.messageId.startsWith('<') ? options.messageId : `<${options.messageId}>`
        headers['Message-ID'] = messageId
      }

      // Add reply headers
      if (options.inReplyTo) {
        const inReplyTo = options.inReplyTo.startsWith('<') ? options.inReplyTo : `<${options.inReplyTo}>`
        const references = options.references
          ? options.references.map(ref => ref.startsWith('<') ? ref : `<${ref}>`).join(' ')
          : inReplyTo

        headers['In-Reply-To'] = inReplyTo
        headers.References = references
      }

      payload.headers = headers
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
 * Formats a Discord message as email text
 * Converts Markdown to plain text with formatting
 */
export function formatDiscordMessageAsEmail(
  username: string,
  content: string,
  threadSubject: string,
): EmailOptions {
  // Convert Markdown to plain text
  const text = markdownToPlainText(content)

  return {
    to: '',
    subject: `Re: ${threadSubject}`,
    text,
  }
}

/**
 * Converts Markdown to formatted plain text
 * Uses safe regexes to avoid ReDoS vulnerabilities
 */
function markdownToPlainText(markdown: string): string {
  let text = markdown

  // Code blocks first (to avoid processing markdown inside code)
  // Split by ``` and process alternating sections
  const codeBlockParts = text.split('```')
  for (let i = 0; i < codeBlockParts.length; i++) {
    if (i % 2 === 0) {
      // Not in code block - process markdown
      let part = codeBlockParts[i]

      // Bold: **text** or __text__ -> *text*
      part = part.replace(/\*\*([^*]+)\*\*/g, '*$1*')
      part = part.replace(/__([^_]+)__/g, '*$1*')

      // Italic: *text* or _text_ -> *text*
      part = part.replace(/\*([^*]+)\*/g, '*$1*')
      part = part.replace(/_([^_]+)_/g, '*$1*')

      // Inline code: `code` -> "code"
      part = part.replace(/`([^`]+?)`/g, '"$1"')

      // Links: [text](url) -> text (url)
      part = part.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '$1 ($2)')

      // Headers: # Header -> Header (match at start of line)
      part = part.replace(/^(#{1,6}) +(.+?)$/gm, '$2')

      // Bullet lists: - item or * item -> • item
      part = part.replace(/^[*-] +(.+?)$/gm, '• $1')

      // Blockquotes: > quote -> | quote
      part = part.replace(/^> +(.+?)$/gm, '| $1')

      // Horizontal rules: --- or *** -> ────────
      part = part.replace(/^[*-]{3,}$/gm, '────────')

      codeBlockParts[i] = part
    }
    else {
      // In code block - extract just the code (skip language identifier)
      const lines = codeBlockParts[i].split('\n')
      if (lines.length > 0) {
        lines.shift() // Remove first line (language identifier)
      }
      codeBlockParts[i] = lines.join('\n')
    }
  }

  text = codeBlockParts.join('\n')

  return text.trim()
}
