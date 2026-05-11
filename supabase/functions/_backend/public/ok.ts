import { resolveCapgoApiVersion } from '../utils/api_version.ts'
import { BRES, honoFactory, parseBody } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'

export const app = honoFactory.createApp()

export function summarizeOkRequestBodyForLog(body: unknown) {
  if (body === null || body === undefined) {
    return {
      bodyType: body === null ? 'null' : 'undefined',
      hasBody: false,
    }
  }

  if (Array.isArray(body)) {
    return {
      bodyType: 'array',
      hasBody: true,
      itemCount: body.length,
    }
  }

  if (typeof body === 'object') {
    return {
      bodyType: 'object',
      hasBody: true,
      keyCount: Object.keys(body as Record<string, unknown>).length,
    }
  }

  return {
    bodyType: typeof body,
    hasBody: true,
  }
}

app.post('/', async (c) => {
  const body = await parseBody<any>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'body', data: summarizeOkRequestBodyForLog(body) })
  const apiVersion = resolveCapgoApiVersion(c)

  return apiVersion.handle({
    '2025-10-01': () => c.json(BRES),
    '2025-10-02': info => c.json({ ...BRES, version: info.normalized, detail: 'ok endpoint 2025-10-02 response' }),
    'default': () => c.json(BRES),
  })
})

app.get('/', (c) => {
  const apiVersion = resolveCapgoApiVersion(c)

  return apiVersion.handle({
    '2025-10-01': () => c.json(BRES),
    '2025-10-02': info => c.json({ ...BRES, version: info.normalized, detail: 'ok endpoint 2025-10-02 response' }),
    'default': () => c.json(BRES),
  })
})
