import type { EmailAttachment, Env } from './types'

// Files expire after 7 days (matching Discord thread archive duration)
const FILE_EXPIRY_DAYS = 7
const FILE_EXPIRY_MS = FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

interface R2FileMetadata {
  originalFilename: string
  contentType: string
  size: number
  uploadedAt: number
  expiresAt: number
  emailMessageId: string
}

/**
 * Generates a unique key for storing a file in R2
 */
function generateFileKey(): string {
  return crypto.randomUUID()
}

/**
 * Uploads a large attachment to R2 and returns a private URL
 * The URL is served by this worker with expiration validation
 */
export async function uploadLargeAttachment(
  env: Env,
  attachment: EmailAttachment,
  emailMessageId: string,
): Promise<string | null> {
  const fileKey = generateFileKey()
  const now = Date.now()
  const expiresAt = now + FILE_EXPIRY_MS

  try {
    // Convert attachment content to ArrayBuffer if needed
    let content: ArrayBuffer
    if (attachment.content instanceof ArrayBuffer) {
      content = attachment.content
    }
    else if (typeof attachment.content === 'string') {
      // Base64 encoded
      const binaryString = atob(attachment.content)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      content = bytes.buffer
    }
    else {
      console.error('❌ Invalid attachment content type')
      return null
    }

    // Store file metadata for expiration validation
    const metadata: R2FileMetadata = {
      originalFilename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      uploadedAt: now,
      expiresAt,
      emailMessageId,
    }

    // Upload to R2 with metadata
    const r2Key = `attachments/${fileKey}/${attachment.filename}`
    await env.EMAIL_ATTACHMENTS.put(r2Key, content, {
      httpMetadata: {
        contentType: attachment.contentType,
        contentDisposition: `attachment; filename="${attachment.filename}"`,
      },
      customMetadata: {
        expiresAt: expiresAt.toString(),
        emailMessageId,
        originalFilename: attachment.filename,
      },
    })

    // Also store metadata in KV for quick expiration checks
    const kvKey = `r2:${fileKey}`
    await env.EMAIL_THREAD_MAPPING.put(kvKey, JSON.stringify(metadata), {
      expirationTtl: FILE_EXPIRY_DAYS * 24 * 60 * 60, // TTL in seconds
    })

    console.log(`📦 Uploaded large attachment to R2: ${r2Key} (${formatFileSize(attachment.size)})`)

    // Return the URL to access the file through this worker
    // The URL format is: https://email.capgo.app/files/{fileKey}/{filename}
    const baseUrl = getBaseUrl(env)
    return `${baseUrl}/files/${fileKey}/${encodeURIComponent(attachment.filename)}`
  }
  catch (error) {
    console.error('❌ Failed to upload attachment to R2:', error)
    return null
  }
}

/**
 * Serves a file from R2 with expiration validation
 */
export async function serveR2File(
  env: Env,
  fileKey: string,
  filename: string,
): Promise<Response> {
  try {
    // Check if file metadata exists and hasn't expired
    const kvKey = `r2:${fileKey}`
    const metadataStr = await env.EMAIL_THREAD_MAPPING.get(kvKey)

    if (!metadataStr) {
      console.log(`❌ File not found or expired: ${fileKey}`)
      return new Response('File not found or expired', { status: 404 })
    }

    const metadata: R2FileMetadata = JSON.parse(metadataStr)

    // Double-check expiration (KV TTL should handle this, but be safe)
    if (Date.now() > metadata.expiresAt) {
      // Clean up expired file
      await cleanupExpiredFile(env, fileKey, filename)
      return new Response('File has expired', { status: 410 })
    }

    // Fetch from R2
    const r2Key = `attachments/${fileKey}/${filename}`
    const object = await env.EMAIL_ATTACHMENTS.get(r2Key)

    if (!object) {
      console.log(`❌ R2 object not found: ${r2Key}`)
      return new Response('File not found', { status: 404 })
    }

    // Return the file with appropriate headers
    const headers = new Headers()
    headers.set('Content-Type', metadata.contentType || 'application/octet-stream')
    headers.set('Content-Disposition', `attachment; filename="${metadata.originalFilename}"`)
    headers.set('Content-Length', metadata.size.toString())
    headers.set('Cache-Control', 'private, max-age=3600') // Cache for 1 hour
    headers.set('X-Expires-At', new Date(metadata.expiresAt).toISOString())

    return new Response(object.body, { headers })
  }
  catch (error) {
    console.error('❌ Error serving R2 file:', error)
    return new Response('Internal error', { status: 500 })
  }
}

/**
 * Cleans up an expired file from R2 and KV
 */
async function cleanupExpiredFile(
  env: Env,
  fileKey: string,
  filename: string,
): Promise<void> {
  try {
    const r2Key = `attachments/${fileKey}/${filename}`
    await env.EMAIL_ATTACHMENTS.delete(r2Key)
    await env.EMAIL_THREAD_MAPPING.delete(`r2:${fileKey}`)
    console.log(`🗑️  Cleaned up expired file: ${r2Key}`)
  }
  catch (error) {
    console.error('❌ Error cleaning up expired file:', error)
  }
}

/**
 * Gets the base URL for the worker
 */
function getBaseUrl(_env: Env): string {
  return 'https://email.capgo.app'
}

/**
 * Formats file size in human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
