import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface HttpResult {
  status: number
  text: string
}

/**
 * Plain HTTP for the assistant. In the native app requests go through native HTTP (same as the Capgo
 * browser app): OpenAI's edge rejects some WebView origins and turns errors into an opaque "Load failed".
 */
export async function assistantRequest(
  url: string,
  init: { method: 'GET' | 'POST', headers?: Record<string, string>, body?: string, timeoutMs?: number },
): Promise<HttpResult> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: init.method,
      headers: init.headers,
      data: init.body,
      responseType: 'text',
      connectTimeout: init.timeoutMs,
      readTimeout: init.timeoutMs,
    })
    return { status: response.status, text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data) }
  }
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined,
  })
  return { status: response.status, text: await response.text() }
}
