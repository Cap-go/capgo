import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', (c: Context) => {
  if (getRuntimeKey() !== 'workerd') {
    // Partial and TUS upload are only available on workerd
    return c.json({
      partialUpload: false,
      partialUploadForced: false,
      TUSUpload: false,
      TUSUploadForced: false,
    })
  }
  try {
    return c.json({
      partialUpload: true,
      partialUploadForced: true,
      TUSUpload: true,
      TUSUploadForced: true,
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot get files config', error: JSON.stringify(e) }, 500)
  }
})
