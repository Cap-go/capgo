import type { EmailAttachment, EmailMessage, ParsedEmail } from './types'

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
  const { body, attachments } = parseEmailBodyAndAttachments(rawText)

  return {
    from,
    to: message.to,
    subject,
    body,
    inReplyTo,
    messageId,
    references,
    date,
    attachments,
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
 * Simple email body and attachment parser
 * Note: For production, consider using a library like mailparser or postal-mime
 */
function parseEmailBodyAndAttachments(rawEmail: string | any): {
  body: { text?: string, html?: string }
  attachments: EmailAttachment[]
} {
  const body: { text?: string, html?: string } = {}
  const attachments: EmailAttachment[] = []

  // Ensure rawEmail is a string
  if (typeof rawEmail !== 'string') {
    console.warn('⚠️  rawEmail is not a string:', typeof rawEmail)
    return { body: { text: '' }, attachments: [] }
  }

  if (!rawEmail || rawEmail.length === 0) {
    console.warn('⚠️  rawEmail is empty')
    return { body: { text: '' }, attachments: [] }
  }

  // Simple boundary detection for multipart messages
  const boundaryMatch = rawEmail.match(/boundary="?([^"\s;]+)"?/i)

  if (boundaryMatch) {
    // Multipart email
    const boundary = boundaryMatch[1]
    const parts = rawEmail.split(new RegExp(`--${escapeRegex(boundary)}`))

    for (const part of parts) {
      // Skip empty parts and the final boundary marker
      if (!part.trim() || part.trim() === '--') {
        continue
      }

      // Parse Content-Type header from this part
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i)
      const contentType = contentTypeMatch?.[1]?.trim().toLowerCase() || ''

      // Parse Content-Disposition header
      const contentDispositionMatch = part.match(/Content-Disposition:\s*([^;\r\n]+)/i)
      const contentDisposition = contentDispositionMatch?.[1]?.trim().toLowerCase() || ''

      // Check for nested multipart (e.g., multipart/alternative inside multipart/mixed)
      if (contentType.startsWith('multipart/')) {
        const nestedBoundaryMatch = part.match(/boundary="?([^"\s;]+)"?/i)
        if (nestedBoundaryMatch) {
          const nestedResult = parseEmailBodyAndAttachments(part)
          if (nestedResult.body.text && !body.text) {
            body.text = nestedResult.body.text
          }
          if (nestedResult.body.html && !body.html) {
            body.html = nestedResult.body.html
          }
          attachments.push(...nestedResult.attachments)
        }
        continue
      }

      // Check if this is an attachment or inline content
      const isAttachment = contentDisposition === 'attachment'
      const isInlineImage = contentDisposition === 'inline' && contentType.startsWith('image/')

      if (isAttachment || isInlineImage) {
        // Extract attachment
        const attachment = parseAttachmentPart(part, contentType)
        if (attachment) {
          attachments.push(attachment)
          console.log(`📎 Found attachment: ${attachment.filename} (${attachment.contentType}, ${attachment.size} bytes)`)
        }
      }
      else if (contentType === 'text/plain' || part.includes('Content-Type: text/plain')) {
        const textMatch = part.match(/\r?\n\r?\n([\s\S]+)/)
        if (textMatch) {
          body.text = decodeContent(textMatch[1].trim(), part)
        }
      }
      else if (contentType === 'text/html' || part.includes('Content-Type: text/html')) {
        const htmlMatch = part.match(/\r?\n\r?\n([\s\S]+)/)
        if (htmlMatch) {
          body.html = decodeContent(htmlMatch[1].trim(), part)
        }
      }
      else if (contentType.startsWith('image/') || contentType.startsWith('application/')) {
        // This might be an inline image without explicit disposition
        const attachment = parseAttachmentPart(part, contentType)
        if (attachment) {
          attachments.push(attachment)
          console.log(`📎 Found inline content: ${attachment.filename} (${attachment.contentType}, ${attachment.size} bytes)`)
        }
      }
    }
  }
  else {
    // Simple plain text email
    const bodyMatch = rawEmail.match(/\r?\n\r?\n([\s\S]+)$/)
    if (bodyMatch) {
      body.text = bodyMatch[1].trim()
    }
  }

  console.log(`📧 Parsed email: ${attachments.length} attachment(s) found`)
  return { body, attachments }
}

/**
 * Parses an attachment part from a MIME multipart section
 */
function parseAttachmentPart(part: string, contentType: string): EmailAttachment | null {
  // Extract filename from Content-Disposition or Content-Type
  let filename = 'attachment'

  // Try Content-Disposition first
  const dispositionFilenameMatch = part.match(/Content-Disposition:[^\r\n]*filename="?([^"\r\n;]+)"?/i)
  if (dispositionFilenameMatch) {
    filename = dispositionFilenameMatch[1].trim()
  }
  else {
    // Try Content-Type name parameter
    const contentTypeNameMatch = part.match(/Content-Type:[^\r\n]*name="?([^"\r\n;]+)"?/i)
    if (contentTypeNameMatch) {
      filename = contentTypeNameMatch[1].trim()
    }
    else {
      // Generate filename based on content type
      const ext = getExtensionForContentType(contentType)
      filename = `attachment${ext}`
    }
  }

  // Extract the content (after headers)
  const contentMatch = part.match(/\r?\n\r?\n([\s\S]+)/)
  if (!contentMatch) {
    return null
  }

  let content = contentMatch[1].trim()

  // Decode the content based on encoding
  const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
  const encoding = encodingMatch?.[1]?.toLowerCase().trim() || ''

  let binaryContent: ArrayBuffer

  if (encoding === 'base64') {
    try {
      // Remove whitespace and decode base64
      const cleanBase64 = content.replace(/\s/g, '')
      const binaryString = atob(cleanBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      binaryContent = bytes.buffer
    }
    catch (error) {
      console.error('❌ Failed to decode base64 attachment:', error)
      return null
    }
  }
  else {
    // For other encodings, convert string to ArrayBuffer
    const encoder = new TextEncoder()
    binaryContent = encoder.encode(content).buffer
  }

  return {
    filename,
    contentType: contentType || 'application/octet-stream',
    content: binaryContent,
    size: binaryContent.byteLength,
  }
}

/**
 * Gets file extension for a content type
 */
function getExtensionForContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/json': '.json',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/csv': '.csv',
  }
  return typeMap[contentType] || ''
}

/**
 * Decodes email content based on Content-Transfer-Encoding
 */
function decodeContent(content: string, part: string): string {
  const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)
  const encoding = encodingMatch?.[1]?.toLowerCase().trim()

  // Get charset from Content-Type header
  const charsetMatch = part.match(/charset=["']?([^"';\s\r\n]+)["']?/i)
  const charset = charsetMatch?.[1]?.toLowerCase() || 'utf-8'

  switch (encoding) {
    case 'base64':
      try {
        return decodeBase64Utf8(content.replace(/\s/g, ''), charset)
      }
      catch {
        return content
      }
    case 'quoted-printable':
      return decodeQuotedPrintable(content, charset)
    default:
      return content
  }
}

/**
 * Decodes base64 content to UTF-8 string
 * atob() only decodes to Latin-1, so we need to handle UTF-8 properly
 */
function decodeBase64Utf8(base64: string, charset: string = 'utf-8'): string {
  try {
    // Decode base64 to binary string
    const binaryStr = atob(base64)

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    // Decode bytes using TextDecoder with appropriate charset
    const decoder = new TextDecoder(charset)
    return decoder.decode(bytes)
  }
  catch {
    // Fallback to simple atob if TextDecoder fails
    return atob(base64)
  }
}

/**
 * Decodes quoted-printable content with proper UTF-8 support
 * Quoted-printable encodes each byte separately, so UTF-8 multi-byte
 * characters appear as multiple =XX sequences (e.g., "é" = =C3=A9)
 */
function decodeQuotedPrintable(content: string, charset: string = 'utf-8'): string {
  // First, remove soft line breaks
  const cleaned = content.replace(/=\r?\n/g, '')

  // Collect bytes from =XX sequences
  const bytes: number[] = []
  let result = ''
  let i = 0

  while (i < cleaned.length) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length) {
      const hex = cleaned.substring(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16))
        i += 3
        continue
      }
    }

    // Flush any accumulated bytes before adding plain text
    if (bytes.length > 0) {
      result += decodeBytes(bytes, charset)
      bytes.length = 0
    }

    result += cleaned[i]
    i++
  }

  // Flush remaining bytes
  if (bytes.length > 0) {
    result += decodeBytes(bytes, charset)
  }

  return result
}

/**
 * Decodes a byte array to string using the specified charset
 */
function decodeBytes(bytes: number[], charset: string): string {
  try {
    const decoder = new TextDecoder(charset)
    return decoder.decode(new Uint8Array(bytes))
  }
  catch {
    // Fallback: decode each byte as Latin-1
    return bytes.map(b => String.fromCharCode(b)).join('')
  }
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
