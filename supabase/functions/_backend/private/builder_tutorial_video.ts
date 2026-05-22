import { presignUrl } from '../utils/aws4.ts'
import { createHono, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'
import { version } from '../utils/version.ts'

/**
 * Tutorial-video config used by the CLI's `build init --platform ios`
 * onboarding flow. When the user opens the Apple Developer Portal from
 * the no-match-recovery menu, the CLI tries to play a short walkthrough
 * video in Picture-in-Picture. To make the URL + integrity hash + the
 * fallback rotatable without redeploying the CLI, all three live as
 * Cloudflare Worker secrets:
 *
 *   BUILDER_TUTORIAL_VIDEO_R2_BUCKET       — name of the R2 bucket
 *   BUILDER_TUTORIAL_VIDEO_R2_PATH         — object path inside the bucket
 *   BUILDER_TUTORIAL_VIDEO_R2_ACCOUNT_ID   — Cloudflare R2 account id
 *   BUILDER_TUTORIAL_VIDEO_R2_ACCESS_KEY   — R2 access key id
 *   BUILDER_TUTORIAL_VIDEO_R2_SECRET_KEY   — R2 secret access key
 *   BUILDER_TUTORIAL_VIDEO_SHA1            — authoritative SHA1 of the video file
 *   BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL     — fallback URL when PiP fails
 *
 * The endpoint generates a fresh presigned GET URL on every call (24h
 * TTL) so the CLI can stream the file without us shipping long-lived
 * tokens or static URLs. SHA1 is returned alongside so the CLI can
 * verify the downloaded bytes match the file we authored.
 *
 * If ANY of the R2 / SHA1 secrets are missing, the endpoint returns
 * `{ enabled: false }` — the CLI side falls back to the YouTube URL
 * directly without attempting the PiP flow. This lets us ship the
 * endpoint before the actual tutorial video is produced; once secrets
 * are populated, the CLI starts using PiP without any client redeploy.
 */
export const app = createHono('', version)

app.use('/', useCors)

interface BuilderTutorialVideoResponse {
  enabled: boolean
  /** Presigned R2 GET URL, fresh on every call. Absent when enabled=false. */
  presignedUrl?: string
  /** Lowercase hex SHA1 of the video file. Absent when enabled=false. */
  sha1?: string
  /** Browser fallback when PiP is unavailable. Always present when enabled=true. */
  youtubeFallback?: string
  /** Seconds until the presigned URL expires. */
  expiresInSeconds?: number
}

const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60 // 24h — matches the previous hardcoded value the CLI used.

app.get('/', (c) => {
  const requestId = c.get('requestId')

  const bucket = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_R2_BUCKET').trim()
  const path = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_R2_PATH').trim()
  const accountId = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_R2_ACCOUNT_ID').trim()
  const accessKeyId = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_R2_ACCESS_KEY').trim()
  const secretAccessKey = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_R2_SECRET_KEY').trim()
  const sha1 = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_SHA1').trim().toLowerCase()
  const youtubeFallback = getEnv(c, 'BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL').trim()

  // All five R2 secrets, the SHA1, and the youtube URL must be present
  // to consider the feature enabled. Any missing piece short-circuits
  // to `{ enabled: false }` so the CLI quietly falls back.
  const missing: string[] = []
  if (!bucket)
    missing.push('BUILDER_TUTORIAL_VIDEO_R2_BUCKET')
  if (!path)
    missing.push('BUILDER_TUTORIAL_VIDEO_R2_PATH')
  if (!accountId)
    missing.push('BUILDER_TUTORIAL_VIDEO_R2_ACCOUNT_ID')
  if (!accessKeyId)
    missing.push('BUILDER_TUTORIAL_VIDEO_R2_ACCESS_KEY')
  if (!secretAccessKey)
    missing.push('BUILDER_TUTORIAL_VIDEO_R2_SECRET_KEY')
  if (!sha1)
    missing.push('BUILDER_TUTORIAL_VIDEO_SHA1')
  if (!youtubeFallback)
    missing.push('BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL')

  if (missing.length > 0) {
    cloudlog({ requestId, context: 'builder_tutorial_video', enabled: false, reason: `missing ${missing.join(', ')}` })
    const response: BuilderTutorialVideoResponse = { enabled: false }
    return c.json(response)
  }

  // R2's "S3-compatible" hostname is account-id-scoped; objects are
  // addressed as <bucket>/<path>. presignUrl's `path` is the canonical
  // resource portion (no protocol/host).
  const hostname = `${accountId}.r2.cloudflarestorage.com`
  const resourcePath = `/${bucket}/${path.replace(/^\//, '')}`

  const presignedUrl = presignUrl({
    method: 'GET',
    hostname,
    path: resourcePath,
    region: 'auto', // R2 doesn't care about the region as long as we're consistent.
    accessKeyId,
    secretAccessKey,
    expirySeconds: DEFAULT_EXPIRY_SECONDS,
  })

  cloudlog({ requestId, context: 'builder_tutorial_video', enabled: true })
  const response: BuilderTutorialVideoResponse = {
    enabled: true,
    presignedUrl,
    sha1,
    youtubeFallback,
    expiresInSeconds: DEFAULT_EXPIRY_SECONDS,
  }
  return c.json(response)
})
