// Validates an Apple ID + app-specific password by calling the iTMSTransporter
// authenticateForSession JSON-RPC. ADVISORY ONLY: never throws on failure and
// never blocks; callers surface the result (pass / warning) but always continue.
const ENDPOINT = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService'

export interface AppPasswordResult { valid: boolean, code?: unknown, message?: string }

export async function validateAppleAppPassword(username: string, appPassword: string, fetchImpl: typeof fetch = fetch): Promise<AppPasswordResult> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'iTMSTransporter/2.0.0' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'authenticateForSession',
        id: String(Date.now()),
        params: { Username: username, Password: appPassword },
      }),
    })
    const j: any = await res.json().catch(() => null)
    return {
      valid: j?.result?.Success === true,
      code: j?.result?.ErrorCode ?? j?.error?.code,
      message: j?.result?.ErrorMessage ?? j?.error?.message,
    }
  }
  catch (e) {
    return { valid: false, message: e instanceof Error ? e.message : String(e) }
  }
}
