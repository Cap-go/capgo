// Appflow OAuth (Authorization Code + PKCE / OpenID Connect) login, ported from
// the Ionic CLI's secure pathway. NO dependency on @ionic/cli. Used by the
// `capgo build init` Appflow migration to obtain an opaque `ion_` bearer token.
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'

const AUTHORIZE_URL = 'https://ionicframework.com/oauth/authorize'
const TOKEN_URL = 'https://api.ionicjs.com/oauth/token'
const AUDIENCE = 'https://api.ionicjs.com'
const CLIENT_ID = 'cli'
const REDIRECT_URI = 'http://localhost:8123'
const REDIRECT_PORT = 8123
const SCOPE = 'openid profile email offline_access'

export interface AppflowToken {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  capturedAtMs: number
}

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function pkce(): { verifier: string, challenge: string } {
  const verifier = b64url(randomBytes(32))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

const genNonce = (): string => b64url(randomBytes(32))

export function buildAuthorizeUrl(challenge: string, state: string, nonce: string): string {
  const u = new URL(AUTHORIZE_URL)
  for (const [k, v] of Object.entries({
    audience: AUDIENCE,
    scope: SCOPE,
    response_type: 'code',
    client_id: CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_URI,
    nonce,
    state,
  }))
    u.searchParams.set(k, v)
  return u.toString()
}

export function isExpired(t: Pick<AppflowToken, 'expires_in' | 'capturedAtMs'>, marginMs = 60_000): boolean {
  return Date.now() >= t.capturedAtMs + t.expires_in * 1000 - marginMs
}

function defaultOpen(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  }
  catch {
    // best-effort; the URL is also printed by the caller
  }
}

function waitForCode(): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '', REDIRECT_URI)
      const code = u.searchParams.get('code')
      const error = u.searchParams.get('error')
      if (!code && !error) {
        res.writeHead(204)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:system-ui;padding:3rem"><h2>You can close this tab and return to your terminal.</h2></body></html>')
      req.socket.destroy()
      server.close()
      if (error)
        reject(new Error(`Appflow authorize returned error=${error}`))
      else
        resolve({ code: code! })
    })
    server.on('error', reject)
    server.listen(REDIRECT_PORT, 'localhost')
    setTimeout(() => {
      server.close()
      reject(new Error('Timed out waiting for the browser redirect.'))
    }, 5 * 60 * 1000)
  })
}

async function exchange(body: Record<string, string>): Promise<AppflowToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
  })
  if (!res.ok)
    throw new Error(`Appflow token endpoint returned HTTP ${res.status}`)
  const j = await res.json() as Omit<AppflowToken, 'capturedAtMs'>
  return { ...j, capturedAtMs: Date.now() }
}

export async function loginWithBrowser(opts: { openBrowser?: (url: string) => void } = {}): Promise<AppflowToken> {
  const { verifier, challenge } = pkce()
  const url = buildAuthorizeUrl(challenge, b64url(randomBytes(16)), genNonce())
  const codeP = waitForCode()
  ;(opts.openBrowser ?? defaultOpen)(url)
  const { code } = await codeP
  return exchange({ grant_type: 'authorization_code', client_id: CLIENT_ID, code_verifier: verifier, code, redirect_uri: REDIRECT_URI })
}

export async function refresh(token: AppflowToken): Promise<AppflowToken> {
  if (!token.refresh_token)
    throw new Error('No refresh_token available.')
  const t = await exchange({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: token.refresh_token })
  return { refresh_token: token.refresh_token, ...t }
}
