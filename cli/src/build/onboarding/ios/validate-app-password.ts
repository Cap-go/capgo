// Validates an Apple ID + app-specific password by calling the iTMSTransporter
// authenticateForSession JSON-RPC. ADVISORY ONLY: never throws on failure and
// never blocks; callers surface the result (pass / warning) but always continue.
//
// The result distinguishes a genuine AUTH REJECTION (Apple replied, credentials
// rejected) from a TRANSPORT/CHECK failure (network error, non-2xx, unparseable
// body) via `kind`, so callers don't misreport "could not reach Apple" as
// "password is wrong". Both remain advisory.
const ENDPOINT = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService'

export type AppPasswordResultKind = 'authenticated' | 'rejected' | 'unreachable'
export interface AppPasswordResult { valid: boolean, kind: AppPasswordResultKind, code?: unknown, message?: string }

export async function validateAppleAppPassword(username: string, appPassword: string, fetchImpl: typeof fetch = fetch): Promise<AppPasswordResult> {
  let res: Response
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'iTMSTransporter/2.0.0' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'authenticateForSession',
        id: String(Date.now()),
        params: { Username: username, Password: appPassword },
      }),
    })
  }
  catch (e) {
    // Network/DNS/TLS failure — we could not reach Apple, so we cannot judge the
    // credential. Distinct from a rejection.
    return { valid: false, kind: 'unreachable', message: `could not reach Apple to verify (${e instanceof Error ? e.message : String(e)})` }
  }

  // Read the body once. Prefer text() (lets us treat an unparseable body as a
  // check failure), and fall back to json() for fetch shims that only expose it.
  let j: any = null
  let bodyParsed = true
  if (typeof (res as { text?: unknown }).text === 'function') {
    const text = await res.text().catch(() => null)
    if (text === null) {
      bodyParsed = false
    }
    else {
      try {
        j = text ? JSON.parse(text) : null
      }
      catch {
        bodyParsed = false
      }
    }
  }
  else {
    j = await (res as { json?: () => Promise<unknown> }).json?.().catch?.(() => null) ?? null
  }

  // A non-2xx response or an unparseable body means the CHECK failed, not that
  // the password was rejected.
  if (!res.ok || !bodyParsed)
    return { valid: false, kind: 'unreachable', message: `verification endpoint returned HTTP ${res.status}${!bodyParsed ? ' with no parseable body' : ''}` }
  if (j?.result?.Success === true)
    return { valid: true, kind: 'authenticated', message: 'authenticated with Apple' }
  // Apple replied but did not authenticate: a genuine rejection.
  return {
    valid: false,
    kind: 'rejected',
    code: j?.result?.ErrorCode ?? j?.error?.code,
    message: j?.result?.ErrorMessage ?? j?.error?.message ?? 'Apple rejected the credentials',
  }
}
