import type { EmailMessage, ParsedEmail } from './types'

/**
 * Parses an incoming email message
 */
export function parseEmail(message: EmailMessage, rawEmailText?: string): ParsedEmail {
  const headers = message.headers

  // Parse From header
  const fromHeader = headers.get('from') || message.from
  const from = parseEmailAddress(fromHeader)

  // Parse Message-ID
  const messageId = headers.get('message-id') || generateMessageId(message.from, Date.now())

  // Parse In-Reply-To
  const inReplyTo = headers.get('in-reply-to') || undefined

  // Parse References
  const referencesHeader = headers.get('references') || ''
  const references = referencesHeader
    ? referencesHeader.split(/\s+/).filter(Boolean)
    : undefined

  // Parse Date
  const dateHeader = headers.get('date')
  const date = dateHeader ? new Date(dateHeader) : new Date()

  // Parse Subject
  const subject = headers.get('subject') || 'No Subject'

  // Parse body (this is simplified - in production you'd use a proper MIME parser)
  // Use provided rawEmailText if available, otherwise try message.raw
  const rawText = rawEmailText || (typeof message.raw === 'string' ? message.raw : '')
  const body = parseEmailBody(rawText)

  return {
    from,
    to: message.to,
    subject,
    body,
    inReplyTo,
    messageId,
    references,
    date,
  }
}

/**
 * Parses email address from header
 * Safe against ReDoS attacks
 */
function parseEmailAddress(addressHeader: string): { email: string, name?: string } {
  const trimmed = addressHeader.trim()

  // Try to match: "Name" <email@example.com>
  const quotedNameMatch = trimmed.match(/^"([^"]+)"\s*<([^>]+)>$/)
  if (quotedNameMatch) {
    return {
      email: quotedNameMatch[2].trim(),
      name: quotedNameMatch[1].trim(),
    }
  }

  // Try to match: Name <email@example.com>
  const nameMatch = trimmed.match(/^([^<]+)<([^>]+)>$/)
  if (nameMatch) {
    return {
      email: nameMatch[2].trim(),
      name: nameMatch[1].trim(),
    }
  }

  // Try to match: <email@example.com>
  const bracketMatch = trimmed.match(/^<([^>]+)>$/)
  if (bracketMatch) {
    return {
      email: bracketMatch[1].trim(),
    }
  }

  // Plain email address
  return { email: trimmed }
}

/**
 * Simple email body parser
 * Note: For production, consider using a library like mailparser or postal-mime
 */
function parseEmailBody(rawEmail: string | any): { text?: string, html?: string } {
  const body: { text?: string, html?: string } = {}

  // Ensure rawEmail is a string
  if (typeof rawEmail !== 'string') {
    console.warn('⚠️  rawEmail is not a string:', typeof rawEmail)
    // Try to extract text from headers or return empty body
    return { text: '' }
  }

  if (!rawEmail || rawEmail.length === 0) {
    console.warn('⚠️  rawEmail is empty')
    return { text: '' }
  }

  // Simple boundary detection for multipart messages
  const boundaryMatch = rawEmail.match(/boundary="?([^"\s;]+)"?/i)

  if (boundaryMatch) {
    // Multipart email
    const boundary = boundaryMatch[1]
    const parts = rawEmail.split(new RegExp(`--${escapeRegex(boundary)}`))

    for (const part of parts) {
      if (part.includes('Content-Type: text/plain')) {
        const textMatch = part.match(/\r?\n\r?\n([\s\S]+)/)
        if (textMatch)
          body.text = decodeContent(textMatch[1].trim(), part)
      }
      else if (part.includes('Content-Type: text/html')) {
        const htmlMatch = part.match(/\r?\n\r?\n([\s\S]+)/)
        if (htmlMatch)
          body.html = decodeContent(htmlMatch[1].trim(), part)
      }
    }
  }
  else {
    // Simple plain text email
    const bodyMatch = rawEmail.match(/\r?\n\r?\n([\s\S]+?)$/)
    if (bodyMatch)
      body.text = bodyMatch[1].trim()
  }

  return body
}

/**
 * Decodes email content based on Content-Transfer-Encoding
 */
function decodeContent(content: string, part: string): string {
  const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
  const encoding = encodingMatch?.[1]?.toLowerCase().trim()

  switch (encoding) {
    case 'base64':
      try {
        return atob(content.replace(/\s/g, ''))
      }
      catch {
        return content
      }
    case 'quoted-printable':
      return decodeQuotedPrintable(content)
    default:
      return content
  }
}

/**
 * Decodes quoted-printable content
 */
function decodeQuotedPrintable(content: string): string {
  return content
    .replace(/=\r?\n/g, '') // Soft line breaks
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Generates a message ID if one doesn't exist
 */
function generateMessageId(from: string, timestamp: number): string {
  const domain = from.split('@')[1] || 'email.worker'
  return `<${timestamp}.${Math.random().toString(36).substring(2)}@${domain}>`
}

/**
 * Extracts the thread ID from email references
 * Returns all potential message IDs in the thread (cleaned, without angle brackets)
 * We return an array because we need to check all references to find a match in KV
 */
export function extractThreadId(email: ParsedEmail): string | null {
  // Collect all potential thread IDs to check
  const potentialIds: string[] = []

  // Add In-Reply-To first (most direct reference)
  if (email.inReplyTo) {
    potentialIds.push(cleanMessageId(email.inReplyTo))
  }

  // Add all References (in reverse order - newest first)
  if (email.references && email.references.length > 0) {
    // Reverse to check newest first, then oldest
    const reversedRefs = [...email.references].reverse()
    for (const ref of reversedRefs) {
      const cleaned = cleanMessageId(ref)
      if (!potentialIds.includes(cleaned)) {
        potentialIds.push(cleaned)
      }
    }
  }

  // Return the first one found (we'll update handleEmailReply to check all)
  return potentialIds.length > 0 ? potentialIds[0] : null
}

/**
 * Gets all potential thread IDs from an email's references
 * Used to check multiple possible mappings in KV
 */
export function getAllPotentialThreadIds(email: ParsedEmail): string[] {
  const potentialIds: string[] = []

  if (email.inReplyTo) {
    potentialIds.push(cleanMessageId(email.inReplyTo))
  }

  if (email.references && email.references.length > 0) {
    const reversedRefs = [...email.references].reverse()
    for (const ref of reversedRefs) {
      const cleaned = cleanMessageId(ref)
      if (!potentialIds.includes(cleaned)) {
        potentialIds.push(cleaned)
      }
    }
  }

  return potentialIds
}

/**
 * Cleans up Message-ID by removing angle brackets
 */
export function cleanMessageId(messageId: string): string {
  return messageId.replace(/^<|>$/g, '')
}
