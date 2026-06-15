import type { FetchStoreMetadataBody } from '../public/app/store_metadata.ts'
import { fetchStoreMetadata } from '../public/app/store_metadata.ts'
import { createHono, middlewareAuth, parseBody, useCors } from '../utils/hono.ts'
import { version } from '../utils/version.ts'

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<FetchStoreMetadataBody>(c)
  return fetchStoreMetadata(c, body)
})
