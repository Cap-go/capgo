import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/private/config_builder.ts'

beforeEach(() => {
  // Establish a clean baseline so tests don't leak state from each other or
  // from an actual GOOGLE_OAUTH_* / BUILDER_TUTORIAL_VIDEO_* set in the dev
  // environment. With both groups blanked, the endpoint returns
  // `{ enabled: false, tutorialVideo: { enabled: false } }`.
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '')
  vi.stubEnv('GOOGLE_OAUTH_SCOPES', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_R2_BUCKET', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_R2_PATH', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_R2_ACCOUNT_ID', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_R2_ACCESS_KEY', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_R2_SECRET_KEY', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_SHA1', '')
  vi.stubEnv('BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL', '')
})

/**
 * Shape of the disabled tutorialVideo block — every test where video
 * secrets are unset (which is every existing test) expects this exact
 * sub-object to be present on the response.
 */
const TUTORIAL_VIDEO_DISABLED = { enabled: false } as const

afterEach(() => {
  vi.unstubAllEnvs()
})

function get(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env))
    vi.stubEnv(k, v)
  return app.request('http://local/', { method: 'GET' })
}

/**
 * Like `get`, but lets the test SKIP stubbing certain keys so the
 * beforeEach's `vi.stubEnv(k, '')` baseline value passes through. Use
 * this instead of `vi.stubEnv(k, '')` for the "this one secret is
 * missing" case — stubbing the same key to '' a second time inside a
 * test doesn't reliably override the previously-stubbed non-empty
 * value in this Bun + vitest + Hono adapter combination, but skipping
 * the override entirely lets the beforeEach blank stick.
 */
function getSkipping(env: Record<string, string>, skipKeys: string[]) {
  for (const [k, v] of Object.entries(env)) {
    if (!skipKeys.includes(k))
      vi.stubEnv(k, v)
  }
  return app.request('http://local/', { method: 'GET' })
}

describe('get /private/config/builder', () => {
  it('returns enabled:true with clientId, clientSecret, and default scopes when both required env vars are set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '1234.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-abc',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toEqual({
      enabled: true,
      clientId: '1234.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-abc',
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      tutorialVideo: TUTORIAL_VIDEO_DISABLED,
    })
  })

  it('returns enabled:false with no other fields when neither required env var is set', async () => {
    const response = await get({})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false, tutorialVideo: TUTORIAL_VIDEO_DISABLED })
  })

  it('returns enabled:false when only GOOGLE_OAUTH_CLIENT_ID is set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '1234.apps.googleusercontent.com',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false, tutorialVideo: TUTORIAL_VIDEO_DISABLED })
  })

  it('returns enabled:false when only GOOGLE_OAUTH_CLIENT_SECRET is set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-abc',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false, tutorialVideo: TUTORIAL_VIDEO_DISABLED })
  })

  it('treats whitespace-only env vars the same as missing (returns enabled:false)', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '   ',
      GOOGLE_OAUTH_CLIENT_SECRET: '\t\n',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false, tutorialVideo: TUTORIAL_VIDEO_DISABLED })
  })

  it('returns a custom single scope when GOOGLE_OAUTH_SCOPES is set to one value', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: 'https://www.googleapis.com/auth/cloud-platform',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform'])
  })

  it('parses comma-separated scopes and trims whitespace around each entry', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: ' https://www.googleapis.com/auth/androidpublisher , https://www.googleapis.com/auth/cloud-platform ',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual([
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/cloud-platform',
    ])
  })

  it('falls back to the default scope when GOOGLE_OAUTH_SCOPES is set but yields zero non-empty entries', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: ' , , ',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/androidpublisher'])
  })

  // ── tutorialVideo sub-block ─────────────────────────────────────────

  /** Minimum set of valid BUILDER_TUTORIAL_VIDEO_* env vars. */
  const VALID_VIDEO_ENV = {
    BUILDER_TUTORIAL_VIDEO_R2_BUCKET: 'capgo',
    BUILDER_TUTORIAL_VIDEO_R2_PATH: 'tutorials/ios-import.mov',
    BUILDER_TUTORIAL_VIDEO_R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    BUILDER_TUTORIAL_VIDEO_R2_ACCESS_KEY: 'access-key-id',
    BUILDER_TUTORIAL_VIDEO_R2_SECRET_KEY: 'secret-access-key',
    BUILDER_TUTORIAL_VIDEO_SHA1: 'abcdef0123456789abcdef0123456789abcdef01',
    BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }

  it('tutorialVideo: enabled with all seven secrets set — returns presigned URL + sha1 + fallback', async () => {
    const response = await get(VALID_VIDEO_ENV)
    expect(response.status).toBe(200)
    const body = await response.json() as { tutorialVideo: Record<string, unknown> }
    expect(body.tutorialVideo).toMatchObject({
      enabled: true,
      sha1: 'abcdef0123456789abcdef0123456789abcdef01',
      youtubeFallback: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      expiresInSeconds: 24 * 60 * 60,
    })
    expect(typeof body.tutorialVideo.presignedUrl).toBe('string')
    expect(body.tutorialVideo.presignedUrl).toMatch(/^https:\/\/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\.r2\.cloudflarestorage\.com\/capgo\/tutorials\/ios-import\.mov\?X-Amz-Algorithm=AWS4-HMAC-SHA256/)
  })

  it('tutorialVideo: works independently of the OAuth gate (video enabled, OAuth disabled)', async () => {
    const response = await get(VALID_VIDEO_ENV)
    expect(response.status).toBe(200)
    const body = await response.json() as { enabled: boolean, tutorialVideo: { enabled: boolean } }
    expect(body.enabled).toBe(false)
    expect(body.tutorialVideo.enabled).toBe(true)
  })

  it('tutorialVideo: normalizes uppercase SHA1 — enabled:true with lowercase value', async () => {
    // Uppercase is a common copy-paste artifact; we .toLowerCase() before
    // matching the /^[a-f0-9]{40}$/ regex so it ends up valid. The
    // response should carry the LOWERCASE value (what the CLI will
    // SHA1-compare against the downloaded file, which is also lowercase
    // hex from Node's createHash). This locks in the normalization
    // behaviour so a future "reject uppercase" change is a deliberate,
    // visible regression rather than a silent behaviour flip.
    const response = await get({ ...VALID_VIDEO_ENV, BUILDER_TUTORIAL_VIDEO_SHA1: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01' })
    expect(response.status).toBe(200)
    const body = await response.json() as { tutorialVideo: { enabled: boolean, sha1?: string } }
    expect(body.tutorialVideo.enabled).toBe(true)
    expect(body.tutorialVideo.sha1).toBe('abcdef0123456789abcdef0123456789abcdef01')
  })

  // Cases that genuinely produce different bytes than the file's actual
  // SHA1 — verifying these would fail at the CLI side every time, so
  // the endpoint should refuse the misconfiguration up-front. Driven
  // by `it.each` so each malformed value runs in its own test()
  // lifecycle with a fresh beforeEach — that's important because
  // `vi.stubEnv` doesn't reliably re-override a key already stubbed
  // to a non-empty value within the same test (Bun+vitest+Hono adapter
  // quirk; see the bucket-missing test below). NOT `it.concurrent.each`:
  // `vi.stubEnv` mutates process.env, which is process-global, so
  // concurrent iterations would race on the same keys.
  it.each([
    'abcdef0123456789abcdef0123456789abcdef', // too short (38 chars)
    'abcdef0123456789abcdef0123456789abcdef0123', // too long (42 chars)
    'xyz0000000000000000000000000000000000000', // non-hex (g-z)
  ])('tutorialVideo: rejects malformed SHA1 %s — enabled:false', async (sha1) => {
    const response = await get({ ...VALID_VIDEO_ENV, BUILDER_TUTORIAL_VIDEO_SHA1: sha1 })
    expect(response.status).toBe(200)
    const body = await response.json() as { tutorialVideo: { enabled: boolean } }
    expect(body.tutorialVideo).toEqual({ enabled: false })
  })

  it('tutorialVideo: rejects unparsable youtubeFallback — enabled:false', async () => {
    // beforeEach already left every video env at ''; transitioning a
    // single key from '' to a value via get() is the same pattern as
    // the VALID_VIDEO_ENV test, so no manual unstub/restub needed.
    const response = await get({ ...VALID_VIDEO_ENV, BUILDER_TUTORIAL_VIDEO_YOUTUBE_URL: 'not a url' })
    expect(response.status).toBe(200)
    const body = await response.json() as { tutorialVideo: { enabled: boolean } }
    expect(body.tutorialVideo).toEqual({ enabled: false })
  })

  it('tutorialVideo: missing the bucket secret short-circuits to enabled:false', async () => {
    // Spot-check a single missing secret. The beforeEach baseline (all
    // seven blanked) already implicitly tests the "all missing" case via
    // every other test in this describe block, and the malformed-SHA1 /
    // unparsable-URL tests above cover the format-validation branch of
    // the same missing-array code path. Iterating one-at-a-time across
    // every secret would be redundant.
    //
    // Uses `getSkipping` because re-stubbing a key to '' inside a test
    // doesn't override a previously-stubbed non-empty value in this
    // adapter combo; leaving the beforeEach's blank to pass through is
    // the reliable way to assert "this key is empty".
    const response = await getSkipping(VALID_VIDEO_ENV, ['BUILDER_TUTORIAL_VIDEO_R2_BUCKET'])
    expect(response.status).toBe(200)
    const body = await response.json() as { tutorialVideo: { enabled: boolean } }
    expect(body.tutorialVideo).toEqual({ enabled: false })
  })
})
