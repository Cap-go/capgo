export const MAX_BUILDER_ERROR_BODY_BYTES = 4 * 1024

export async function readBuilderErrorBody(response: Response, limit = MAX_BUILDER_ERROR_BODY_BYTES) {
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel().catch(() => undefined)
    return null
  }

  if (!response.body) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength > limit ? null : text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      text += decoder.decode()
      break
    }

    if (!value)
      continue

    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }

  return text
}

export function formatBuilderErrorBody(errorBody: string | null) {
  return errorBody ?? 'builder_error_body_too_large'
}
