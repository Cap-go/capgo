import { resolveCapgoApiVersion } from '../utils/api_version.ts'
import { BRES, honoFactory, parseBody } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'

export const app = honoFactory.createApp()

app.post('/', async (c) => {
  const body = await parseBody<any>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'body', data: body })
  const apiVersion = resolveCapgoApiVersion(c)

  return apiVersion.handle({
    '1': () => c.json(BRES),
    '2': (info) => c.json({ ...BRES, version: info.normalized, detail: 'ok endpoint v2 response' }),
  })
})

app.get('/', (c) => {
  const apiVersion = resolveCapgoApiVersion(c)

  return apiVersion.handle({
    '1': () => c.json(BRES),
    '2': (info) => c.json({ ...BRES, version: info.normalized, detail: 'ok endpoint v2 response' }),
  })
})
