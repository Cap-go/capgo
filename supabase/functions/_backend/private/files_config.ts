import type { Context } from '@hono/hono'
import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
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
  // force partial and tus for 20% of the requests
  const randomPU = Math.random()
  const randomTUS = Math.random()
  const forcePartialUpload = randomPU < 0.5
  const forceTUSUpload = randomTUS < 0.3
  return c.json({
    partialUpload: true,
    partialUploadForced: forcePartialUpload,
    TUSUpload: true,
    TUSUploadForced: forceTUSUpload,
  })
})
